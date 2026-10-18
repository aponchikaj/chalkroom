// Lane C: host tooling while the class runs (additive; the older POST /rooms/:id/host stays).
//   POST /rooms/:id/host/control      pause / resume the tutor's voice for the class, Slower, Skip
//   POST /rooms/:id/host/reexplain    the tutor re-explains the selected figure in the next Q&A
//   POST /rooms/:id/host/pin          a question's group is answered in the next Q&A
//   GET  /rooms/:id/host/checks/:checkId/answers   who answered a check (host only)
// Every control posts a class notice. No model is called here: re-explain and pin only queue a
// class-routed cluster, which the lead tutor (or the mock) answers in the Q&A beat as usual.
import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Api, type HostCheckAnswer, type HostClusterRes, type OkRes, type QuestionRow } from '@chalk/schema';
import { AuthGuard, CurrentUser, type AuthUser } from '../core/auth.guard';
import { ZodPipe } from '../core/zod.pipe';
import { SupabaseService, must } from '../core/supabase.service';
import { EventsService } from '../core/events.service';
import { RateLimit } from '../core/rate-limit';
import { RoomsService } from '../rooms/rooms.service';
import { ConductorService } from '../conductor/conductor.service';
import { hostNotice } from './host-notice';

const PINNED = 'The host pinned this to the next Q&A.';

@Controller('rooms/:id/host')
@UseGuards(AuthGuard)
export class HostController {
  /** rooms the host paused, and whether their gate was already held before the pause */
  private pausedRooms = new Map<string, boolean>();

  constructor(private supa: SupabaseService, private events: EventsService, private rooms: RoomsService, private conductor: ConductorService) {}

  private async hostName(roomId: string, userId: string) {
    const m = await this.supa.db.from('room_members').select('display_name').eq('room_id', roomId).eq('user_id', userId).maybeSingle();
    return (m.data?.display_name as string | undefined) ?? 'The host';
  }

  /** 409: the request is fine, the class is not in a state where it applies */
  private live(phase: string) {
    if (phase === 'lobby') throw new ConflictException('the class has not started');
    if (phase === 'ended') throw new ConflictException('the class has ended');
  }

  @Post('control')
  @HttpCode(202)
  @RateLimit('host-control', 30, 60000)
  async control(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.hostControl)) body: z.infer<typeof Api.hostControl>): Promise<OkRes> {
    const room = await this.rooms.requireHost(id, u.id);
    this.live(room.phase);
    if (body.action === 'skip' && room.phase !== 'check') throw new ConflictException('Skip moves the class on from a check. Wait for the check.');
    await this.events.append(room.main_stream_id, 'notice', hostNotice(body.action, await this.hostName(id, u.id)), u.id);
    const conductor = this.conductor.for(id);
    if (body.action === 'slower' || body.action === 'skip') void conductor.host(body.action);
    // Skip frees the gate it passes; while the tutor stays paused the next gate waits too
    if (body.action === 'skip' && this.pausedRooms.has(id)) { this.pausedRooms.set(id, false); void conductor.host('hold'); }
    if (body.action === 'pause' && !this.pausedRooms.has(id)) {
      // the gate waits with the board: no timer runs out while every device shows "paused".
      // Remember whether the gate was already held (by the host or an activity), so Resume
      // gives back only the hold the pause took.
      this.pausedRooms.set(id, room.gate_held);
      if (!room.gate_held) void conductor.host('hold');
    }
    if (body.action === 'resume') {
      // after an API restart the map is empty: the hold can only be the pause's own, so let it go
      const heldBefore = this.pausedRooms.get(id) ?? false;
      this.pausedRooms.delete(id);
      if (!heldBefore) void conductor.host('resume');
    }
    return { ok: true };
  }

  @Post('reexplain')
  @HttpCode(202)
  @RateLimit('host-reexplain', 10, 60000)
  async reexplain(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.hostReexplain)) body: z.infer<typeof Api.hostReexplain>): Promise<HostClusterRes> {
    const room = await this.rooms.requireHost(id, u.id);
    this.live(room.phase);
    const db = this.supa.db;
    const name = await this.hostName(id, u.id);
    const what = body.label?.trim() || 'this figure';
    const cluster = must(await db.from('clusters').insert({
      room_id: id, title: `Re-explain: ${what}`.slice(0, 120), route: 'class', reason: 'The host asked for this to be explained again.',
      target_segment: null, answer: null, asker_count: 1,
    }).select('id').single(), 'reexplain cluster') as { id: string };
    must(await db.from('questions').insert({
      room_id: id, author_id: u.id, author_name: name, text: `Please explain ${what} again, another way.`,
      anchor: { streamId: room.main_stream_id, shapeIds: body.shapeIds }, segment: room.segment, cluster_id: cluster.id, status: 'grouped',
    }).select('id').single(), 'reexplain question');
    await this.events.append(room.main_stream_id, 'notice', hostNotice('reexplain', name, body.label), u.id);
    return { ok: true, clusterId: cluster.id };
  }

  @Post('pin')
  @HttpCode(202)
  @RateLimit('host-pin', 20, 60000)
  async pin(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.hostPin)) body: z.infer<typeof Api.hostPin>): Promise<HostClusterRes> {
    const room = await this.rooms.requireHost(id, u.id);
    this.live(room.phase);
    const db = this.supa.db;
    const found = await db.from('questions').select('*').eq('id', body.questionId).maybeSingle();
    if (found.error) throw new Error(found.error.message);
    const q = found.data as QuestionRow | null;
    if (!q || q.room_id !== id) throw new NotFoundException('question not found in this class');
    if (q.status === 'flagged') throw new ForbiddenException('a flagged question cannot be pinned');
    let clusterId = q.cluster_id;
    let title = q.text.slice(0, 120);
    if (clusterId) {
      const c = must(await db.from('clusters').select('title').eq('id', clusterId).single(), 'pin cluster') as { title: string };
      title = c.title;
      must(await db.from('clusters').update({ route: 'class', answered: false, reason: PINNED }).eq('id', clusterId).select('id'), 'pin route');
      // the whole group now waits for the class answer (pending ones stay with triage)
      must(await db.from('questions').update({ status: 'grouped' }).eq('cluster_id', clusterId).neq('status', 'pending').neq('status', 'flagged').select('id'), 'pin questions');
    } else {
      const c = must(await db.from('clusters').insert({
        room_id: id, title, route: 'class', reason: PINNED, target_segment: null, answer: null, asker_count: 1,
      }).select('id').single(), 'pin new cluster') as { id: string };
      clusterId = c.id;
      must(await db.from('questions').update({ cluster_id: clusterId, status: 'grouped' }).eq('id', q.id).select('id'), 'pin question');
    }
    await this.events.append(room.main_stream_id, 'notice', hostNotice('pin', await this.hostName(id, u.id), title), u.id);
    return { ok: true, clusterId };
  }

  @Get('checks/:checkId/answers')
  @RateLimit('host-answers', 120, 60000)
  async answers(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('checkId', ParseUUIDPipe) checkId: string): Promise<HostCheckAnswer[]> {
    await this.rooms.requireHost(id, u.id);
    const check = await this.supa.db.from('checks').select('id').eq('id', checkId).eq('room_id', id).maybeSingle();
    if (check.error) throw new Error(`check: ${check.error.message}`);
    if (!check.data) throw new NotFoundException('no such check in this class');
    const rows = must(await this.supa.db.from('check_answers').select('user_id, correct').eq('room_id', id).eq('check_id', checkId), 'check answers') as { user_id: string; correct: boolean | null }[];
    return rows.map((r) => ({ userId: r.user_id, correct: r.correct }));
  }
}
