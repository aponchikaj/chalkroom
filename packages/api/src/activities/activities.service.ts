// lane M: live activities in a class: quiz duel and teach-back.
//
// Rules (documented for the web and the coordinator):
// * One activity at a time per room (409 while one runs). State lives in memory per room:
//   a duel lasts minutes, every result is already written as an event, and an API restart
//   only loses the activity in flight (the web treats it as over once its clock ran out).
// * Activities run only while the class is at a check (phase 'check'): the lead tutor is not
//   writing then. During 'teaching' and 'qa' the answer is 409 "wait for the gate"; in the lobby
//   and after the class ended there is nothing taught to play with (409).
// * rooms.phase is never changed. While an activity runs the gate is held (the conductor's own
//   Hold), so the class does not move on under it; afterwards the hold goes back to what it was.
//   If the host skips the gate anyway, the duel ends at its next step.
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { RoomRow, StreamEventDataOf, StreamEventKind } from '@chalk/schema';
import { EventsService } from '../core/events.service';
import { RoomsService } from '../rooms/rooms.service';
import { ConductorService } from '../conductor/conductor.service';
import { ModelPort } from '../agents/model.port';
import { ActivitiesAgent } from '../agents/activities.agent';
import { summariesOf } from '../conductor/narration';
import { DuelRun } from './duel';
import { TeachbackRun } from './teachback';

type Activity = { kind: 'duel'; run: DuelRun } | { kind: 'teachback'; run: TeachbackRun } | { kind: 'starting' };

export function refuseReason(room: Pick<RoomRow, 'phase'>): string | null {
  switch (room.phase) {
    case 'check': return null;
    case 'teaching': case 'qa': return 'wait for the gate: activities run while the class is at a check';
    case 'lobby': return 'start the class first';
    default: return 'the class has ended';
  }
}

@Injectable()
export class ActivitiesService {
  private log = new Logger('Activities');
  private live = new Map<string, Activity>();
  private agent: ActivitiesAgent;

  constructor(private events: EventsService, private rooms: RoomsService, private conductor: ConductorService, model: ModelPort) {
    this.agent = new ActivitiesAgent(model);
  }

  /** Claim the room's one activity slot, or 409. */
  private async claim(roomId: string, userId: string): Promise<RoomRow> {
    const room = await this.rooms.requireHost(roomId, userId);
    this.rooms.refuseEnded(room);
    if (this.live.has(roomId)) throw new ConflictException('an activity is already running');
    const why = refuseReason(room);
    if (why) throw new ConflictException(why);
    this.live.set(roomId, { kind: 'starting' });
    return room;
  }

  private emitter(room: RoomRow) {
    return async <K extends StreamEventKind>(kind: K, data: StreamEventDataOf<K>, actor = 'lead') => {
      await this.events.append(room.main_stream_id, kind, data, actor);
    };
  }

  /** The class ended: stop its duel or teach-back now (each one frees its slot as it finishes). */
  stop(roomId: string) {
    const a = this.live.get(roomId);
    if (a?.kind === 'duel') a.run.stop();
    else if (a?.kind === 'teachback') a.run.cancel();
  }

  /** Hold the gate while the activity runs; returns how to put it back. */
  private async holdGate(room: RoomRow): Promise<() => Promise<void>> {
    const wasHeld = room.gate_held;
    if (!wasHeld) await this.conductor.for(room.id).host('hold');
    return async () => { if (!wasHeld) await this.conductor.for(room.id).host('resume'); };
  }

  private async names(roomId: string) {
    const all = await this.rooms.allMembers(roomId);
    return new Map(all.map((m) => [m.user_id, m.display_name]));
  }

  // ---- quiz duel -----------------------------------------------------------------------

  async startDuel(roomId: string, userId: string, body: { count: number; secondsPerQuestion: number }) {
    const room = await this.claim(roomId, userId);
    try {
      const events = await this.events.after(room.main_stream_id);
      const questions = await this.agent.writeDuel({
        roomId, prefix: await this.rooms.prefixOf(room), plan: room.lesson_plan, segment: room.segment,
        summaries: summariesOf(events).map((s) => `${s.title}: ${s.summary}`), count: body.count,
      });
      const names = await this.names(roomId);
      const emit = this.emitter(room);
      const run = new DuelRun(randomUUID(), questions, body.secondsPerQuestion, {
        emit: (kind, data) => emit(kind, data),
        present: async () => (await this.rooms.activeMembers(roomId)).map((m) => m.user_id),
        nameOf: (id) => names.get(id) ?? 'Someone',
        stillOn: async () => (await this.rooms.get(roomId)).phase === 'check',
      });
      this.live.set(roomId, { kind: 'duel', run });
      const release = await this.holdGate(room);
      void run.run()
        .catch((e) => this.log.error(`duel ${run.id}: ${(e as Error).message}`))
        .finally(() => this.finish(roomId, run, release));
      return { duelId: run.id };
    } catch (e) {
      this.live.delete(roomId);
      this.log.error(`duel start: ${(e as Error).message}`);
      throw e instanceof ConflictException ? e : new ConflictException('the tutor could not write the duel; try again');
    }
  }

  async duelAnswer(roomId: string, userId: string, body: { duelId: string; index: number; answer: unknown }) {
    await this.rooms.requireMember(roomId, userId);
    const a = this.live.get(roomId);
    if (a?.kind !== 'duel' || a.run.id !== body.duelId) throw new ConflictException('this duel is over');
    if (body.answer === undefined || body.answer === null || JSON.stringify(body.answer).length > 200) throw new BadRequestException('answer: give one short answer');
    const err = await a.run.answer(userId, body.index, body.answer);
    if (err === 'closed') throw new ConflictException('this question is closed');
    if (err === 'twice') throw new ConflictException('you already answered this question');
  }

  // ---- teach-back ----------------------------------------------------------------------

  async startTeachback(roomId: string, userId: string, body: { concept?: string }) {
    const room = await this.claim(roomId, userId);
    try {
      const concept = body.concept?.trim() || room.lesson_plan?.segments[room.segment]?.objective || room.title;
      const prefix = await this.rooms.prefixOf(room);
      const run = new TeachbackRun(randomUUID(), concept, {
        emit: this.emitter(room),
        critique: (name, text) => this.agent.teachbackFeedback({ roomId, prefix, concept, name, text }),
      });
      this.live.set(roomId, { kind: 'teachback', run });
      await run.start();
      const release = await this.holdGate(room);
      void run.done.finally(() => this.finish(roomId, run, release));
      return { teachbackId: run.id };
    } catch (e) {
      this.live.delete(roomId);
      throw e;
    }
  }

  async teachbackVolunteer(roomId: string, userId: string, body: { teachbackId: string }) {
    const member = await this.rooms.requireMember(roomId, userId);
    const run = this.teachback(roomId, body.teachbackId);
    if (!(await run.volunteerAs(userId, member.display_name))) throw new ConflictException('someone already volunteered');
  }

  async teachbackExplain(roomId: string, userId: string, body: { teachbackId: string; text: string }) {
    await this.rooms.requireMember(roomId, userId);
    const run = this.teachback(roomId, body.teachbackId);
    const err = await run.explain(userId, body.text);
    if (err === 'not_volunteer') throw new ForbiddenException('only the volunteer can explain');
    if (err === 'twice') throw new ConflictException('you already sent your explanation');
  }

  private teachback(roomId: string, id: string): TeachbackRun {
    const a = this.live.get(roomId);
    if (a?.kind !== 'teachback' || a.run.id !== id) throw new ConflictException('this teach-back is over');
    return a.run;
  }

  private async finish(roomId: string, run: DuelRun | TeachbackRun, release: () => Promise<void>) {
    const a = this.live.get(roomId);
    if (a && 'run' in a && a.run === run) this.live.delete(roomId);
    try { await release(); } catch (e) { this.log.warn(`gate release: ${(e as Error).message}`); }
  }
}
