// Questions: stored as `pending`, then triage groups and routes them.
// Each new question schedules triage for the room (TriageService: 4 s batch window).
import { Body, Controller, ConflictException, ForbiddenException, HttpCode, Logger, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Api, LIVE, type QuestionRow } from '@chalk/schema';
import { AuthGuard, CurrentUser, type AuthUser } from '../core/auth.guard';
import { ZodPipe } from '../core/zod.pipe';
import { SupabaseService, must } from '../core/supabase.service';
import { RoomsService } from '../rooms/rooms.service';
import { TriageService } from '../triage/triage.service';
import { TriageAgent } from '../agents/triage.agent';
import { RetrieveService } from '../rag/retrieve.service';
import { planTriage, type ClusterWrite } from '../triage/triage-plan';
import { oldClusterAfter, unmergeRefusal, unmergedRoute, type UnmergeQuestion } from './unmerge-plan';
import { RateLimit } from '../core/rate-limit';

@Controller()
@UseGuards(AuthGuard)
export class QuestionsController {
  private log = new Logger('Questions');

  constructor(private supa: SupabaseService, private rooms: RoomsService, private triage: TriageService, private triageAgent: TriageAgent, private retrieve: RetrieveService) {}

  @Post('rooms/:id/questions')
  @RateLimit('ask', LIVE.questionsPerMinute, 60000)
  async ask(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.ask)) body: z.infer<typeof Api.ask>): Promise<QuestionRow> {
    const member = await this.rooms.requireMember(id, u.id);
    if (member.muted) throw new ForbiddenException('the host muted you in this room');
    const room = await this.rooms.get(id);
    this.rooms.refuseEnded(room);
    const q = must(await this.supa.db.from('questions').insert({
      room_id: id, author_id: u.id, author_name: member.display_name, text: body.text, anchor: body.anchor ?? null, segment: room.segment,
    }).select('*').single(), 'ask') as QuestionRow;
    this.triage.schedule(id);
    return q;
  }

  /** Anonymous +1 (toggle). Only the count is visible to the room. */
  @Post('questions/:id/vote')
  @RateLimit('vote', 60, 60000)
  @HttpCode(204)
  async vote(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const db = this.supa.db;
    const found = await db.from('questions').select('room_id').eq('id', id).maybeSingle();
    if (found.error) throw new Error(found.error.message);
    if (!found.data) throw new NotFoundException('question not found');
    const q = found.data as { room_id: string };
    await this.rooms.requireMember(q.room_id, u.id);
    // one statement: concurrent toggles cannot store a stale count
    const r = await db.rpc('toggle_vote', { p_question: id, p_user: u.id });
    if (r.error) throw new Error(r.error.message);
  }

  /**
   * Lane Q: take a question out of its group (the asker or the host). It gets its own cluster,
   * titled with its text and routed by a one-question triage call (no open clusters offered, so
   * it cannot be merged back); the old cluster is recounted, or deleted when nothing is left.
   */
  @Post('questions/:id/unmerge')
  @HttpCode(200)
  async unmerge(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.unmerge)) _b: z.infer<typeof Api.unmerge>): Promise<QuestionRow> {
    const db = this.supa.db;
    const found = await db.from('questions').select('*').eq('id', id).maybeSingle();
    if (found.error) throw new Error(found.error.message);
    if (!found.data) throw new NotFoundException('question not found');
    const q = found.data as QuestionRow;
    const member = await this.rooms.requireMember(q.room_id, u.id);
    if (member.banned) throw new ForbiddenException('you were removed from this room');
    const room = await this.rooms.get(q.room_id);
    const siblings = q.cluster_id
      ? must(await db.from('questions').select('id, author_id, text').eq('cluster_id', q.cluster_id).neq('id', q.id), 'cluster questions') as { id: string; author_id: string; text: string }[]
      : [];
    const refused = unmergeRefusal(q as UnmergeQuestion, u.id, room.host_id, siblings.length);
    if (refused) throw refused[0] === 403 ? new ForbiddenException(refused[1]) : new ConflictException(refused[1]);
    const oldId = q.cluster_id!;

    let planned: ClusterWrite | null = null;
    try {
      const question = { id: q.id, text: q.text, authorId: q.author_id };
      const found = await this.retrieve.context(room, q.text);
      const result = await this.triageAgent.run({
        roomId: room.id, context: found.text, prefix: await this.rooms.prefixOf(room, { board: false }), segment: room.segment,
        segmentTitle: room.lesson_plan?.segments[room.segment]?.title ?? room.title,
        questions: [question], clusters: [], history: {},
      });
      planned = planTriage(result, [question], []).clusters[0] ?? null;
    } catch (e) {
      this.log.warn(`unmerge ${id.slice(0, 8)}: triage failed, routing to the class Q&A (${(e as Error).message})`);
    }
    const r = unmergedRoute(planned);
    const cluster = must(await db.from('clusters').insert({
      room_id: q.room_id, title: q.text, route: r.route, reason: r.reason, target_segment: r.target_segment, answer: r.answer, asker_count: 1,
    }).select('id').single(), 'unmerge cluster') as { id: string };
    const moved = must(await db.from('questions').update({ cluster_id: cluster.id, status: r.status }).eq('id', q.id).select('*').single(), 'unmerge question') as QuestionRow;

    const old = await db.from('clusters').select('answered').eq('id', oldId).maybeSingle();
    if (old.error) throw new Error(`unmerge old cluster: ${old.error.message}`);
    if (old.data) {
      const w = oldClusterAfter(siblings, !!old.data.answered);
      const done = w.op === 'delete' ? await db.from('clusters').delete().eq('id', oldId)
        : w.op === 'update' ? await db.from('clusters').update({ asker_count: w.asker_count, ...(w.title ? { title: w.title } : {}) }).eq('id', oldId)
        : null;
      if (done?.error) throw new Error(`unmerge old cluster: ${done.error.message}`);
    }
    return moved;
  }
}
