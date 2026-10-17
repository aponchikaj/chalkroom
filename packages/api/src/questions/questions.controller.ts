// Questions: stored as `pending`, then triage groups and routes them.
// Asking and +1 work today; triage wiring is backend work (RoomConductor.questionAsked).
import { Body, Controller, HttpCode, HttpException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Api, LIVE, type QuestionRow } from '@chalk/schema';
import { AuthGuard, CurrentUser, type AuthUser } from '../core/auth.guard';
import { ZodPipe } from '../core/zod.pipe';
import { SupabaseService, must } from '../core/supabase.service';
import { RoomsService } from '../rooms/rooms.service';
import { ConductorService } from '../conductor/conductor.service';

const recent = new Map<string, number[]>();
function rateLimit(userId: string) {
  const now = Date.now();
  const times = (recent.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (times.length >= LIVE.questionsPerMinute) throw new HttpException('Too many questions; wait a moment.', 429);
  times.push(now);
  recent.set(userId, times);
}

@Controller()
@UseGuards(AuthGuard)
export class QuestionsController {
  constructor(private supa: SupabaseService, private rooms: RoomsService, private conductor: ConductorService) {}

  @Post('rooms/:id/questions')
  async ask(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.ask)) body: z.infer<typeof Api.ask>): Promise<QuestionRow> {
    const member = await this.rooms.requireMember(id, u.id);
    rateLimit(u.id);
    const room = await this.rooms.get(id);
    const q = must(await this.supa.db.from('questions').insert({
      room_id: id, author_id: u.id, author_name: member.display_name, text: body.text, anchor: body.anchor ?? null, segment: room.segment,
    }).select('*').single(), 'ask') as QuestionRow;
    void this.conductor.for(id).questionAsked();
    return q;
  }

  /** Anonymous +1 (toggle). Only the count is visible to the room. */
  @Post('questions/:id/vote')
  @HttpCode(204)
  async vote(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const db = this.supa.db;
    const q = must(await db.from('questions').select('room_id').eq('id', id).single(), 'question') as { room_id: string };
    await this.rooms.requireMember(q.room_id, u.id);
    const del = await db.from('votes').delete().eq('question_id', id).eq('user_id', u.id).select('user_id');
    if (!del.data?.length) await db.from('votes').insert({ question_id: id, user_id: u.id });
    const count = await db.from('votes').select('user_id', { count: 'exact', head: true }).eq('question_id', id);
    await db.from('questions').update({ votes: count.count ?? 0 }).eq('id', id);
  }
}
