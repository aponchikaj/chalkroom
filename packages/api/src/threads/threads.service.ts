// packages/api/src/threads/threads.service.ts
// One personal side tutor per learner (design doc: Threads in detail). The reply runs in the
// background on a per-thread lane; the learner sees it arrive as `chat` / `board` events.
import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import { describeBoard } from '@chalk/board';
import type { Api, ClusterRow, StreamEventDataOf, ThreadRow } from '@chalk/schema';
import { SupabaseService, must } from '../core/supabase.service';
import { EventsService } from '../core/events.service';
import { RoomsService } from '../rooms/rooms.service';
import { ConductorService } from '../conductor/conductor.service';
import { ThreadTutorAgent } from '../agents/thread-tutor.agent';
import { ThreadStore } from './thread-store';
import { boardOf, chatHistory, learnerLine } from './thread-context';
import { canPost, joinRefusal, withMember } from './thread-access';
import { RetrieveService } from '../rag/retrieve.service';
import { keepKnownCitations } from '../rag/citations';

const greeting = (topic: string) => `Let's dig into **${topic}**. What would you like to know?`;
/** a failed reply: a short visible error, never a scripted answer */
export const THREAD_ERROR = 'The tutor could not answer. Try again.';

@Injectable()
export class ThreadsService {
  private lanes = new Map<string, Promise<unknown>>();
  private log = new Logger('Threads');

  constructor(
    private supa: SupabaseService,
    private events: EventsService,
    private rooms: RoomsService,
    private store: ThreadStore,
    private tutor: ThreadTutorAgent,
    private conductor: ConductorService,
    private retrieve: RetrieveService,
  ) {}

  private async owned(threadId: string, userId: string): Promise<ThreadRow> {
    const t = await this.store.get(threadId);
    if (t.owner_id !== userId) throw new ForbiddenException('only the thread owner can do this');
    return t;
  }

  /** The owner, or a joined classmate, who was not removed from the room. */
  private async requireWriter(t: ThreadRow, userId: string) {
    const m = await this.rooms.member(t.room_id, userId);
    if (m?.banned) throw new ForbiddenException('you were removed from this room');
    if (!m) throw new ForbiddenException('not a member of this room');
  }

  /** `created`: a new thread; false when an offer was accepted (the row already existed). */
  async open(roomId: string, userId: string, body: z.infer<typeof Api.openThread>): Promise<{ thread: ThreadRow; created: boolean }> {
    await this.rooms.requireMember(roomId, userId);
    const room = await this.rooms.get(roomId);
    this.rooms.refuseEnded(room);
    const leftMainSeq = await this.store.mainSeq(room);
    let thread: ThreadRow;
    if (body.threadId) {
      const offered = await this.owned(body.threadId, userId);
      if (offered.room_id !== roomId || offered.status !== 'offered') throw new ConflictException('that thread is not on offer');
      if (await this.store.hasActive(roomId, userId, ['open'])) throw new ConflictException('you already have an open thread');
      thread = await this.store.update(offered.id, { status: 'open', left_main_seq: leftMainSeq });
    } else {
      let topic = body.topic?.trim();
      if (body.questionId) {
        const q = await this.supa.db.from('questions').select('id, room_id, author_id, text').eq('id', body.questionId).maybeSingle();
        if (!q.data || q.data.room_id !== roomId) throw new NotFoundException('question not found');
        if (q.data.author_id !== userId) throw new ForbiddenException('you can only open a thread on your own question');
        topic = topic || (q.data.text as string);
        await this.supa.db.from('questions').update({ status: 'thread' }).eq('id', body.questionId);
      }
      thread = await this.store.createOpen(room, userId, topic || 'Side question', leftMainSeq);
    }
    await this.events.append(thread.stream_id, 'chat', { role: 'tutor', markdown: greeting(thread.topic) }, 'thread');
    void this.conductor.for(roomId).membersChanged();
    return { thread, created: !body.threadId };
  }

  /** Lane Q: a classmate who was peeking joins the thread and may post in it from now on. */
  async join(threadId: string, userId: string): Promise<ThreadRow> {
    const t = await this.store.get(threadId);
    const member = await this.rooms.member(t.room_id, userId);
    const refused = joinRefusal(t, userId, member);
    if (refused) throw refused[0] === 403 ? new ForbiddenException(refused[1]) : new ConflictException(refused[1]);
    const members = withMember(t, userId);
    if (members === t.members) return t;
    return this.store.update(t.id, { members });
  }

  /** Stores the learner line now; the tutor answers in the background, in order per thread. */
  async message(threadId: string, userId: string, text: string): Promise<void> {
    const t = await this.store.get(threadId);
    if (!canPost(t, userId)) throw new ForbiddenException('join this thread to write in it');
    // the owner too: a kicked owner keeps the row, not the right to use the tutor
    await this.requireWriter(t, userId);
    if (t.status !== 'open') throw new ConflictException('this thread is not open');
    const asked = await this.events.append(t.stream_id, 'chat', { role: 'learner', markdown: text, authorId: userId }, userId);
    const prev = this.lanes.get(threadId) ?? Promise.resolve();
    const next = prev.then(() => this.reply(t, text, asked.seq, userId)).catch((e) => this.log.error(`thread ${threadId.slice(0, 8)}: ${(e as Error).stack ?? e}`));
    this.lanes.set(threadId, next);
    // the last reply of the lane: forget the lane, so the map stays small
    void next.then(() => { if (this.lanes.get(threadId) === next) this.lanes.delete(threadId); });
  }

  private async reply(t: ThreadRow, text: string, askedSeq: number, authorId: string) {
    const room = await this.rooms.get(t.room_id);
    // the row as of now: someone may have joined since the message was posted
    const now = await this.store.get(t.id);
    const [main, mine, names] = await Promise.all([this.events.after(room.main_stream_id), this.events.after(t.stream_id), this.writers(now)]);
    try {
      const found = await this.retrieve.context(room, `${t.topic} ${text}`);
      const out = await this.tutor.reply({
        roomId: t.room_id,
        context: found.text,
        prefix: await this.rooms.prefixOf(room),
        mainBoard: describeBoard(boardOf(main)),
        topic: t.topic,
        history: chatHistory(mine.filter((e) => e.seq < askedSeq), names),
      }, learnerLine(text, authorId, names));
      await this.events.append(t.stream_id, 'chat', { role: 'tutor', markdown: out.markdown }, 'thread');
      if (out.steps?.length) await this.events.append(t.stream_id, 'board', { steps: keepKnownCitations(out.steps, await this.retrieve.known(room)) }, 'thread');
    } catch (e) {
      this.log.warn(`thread ${t.id.slice(0, 8)}: reply failed (${(e as Error).message})`);
      await this.events.append(t.stream_id, 'chat', { role: 'tutor', markdown: THREAD_ERROR }, 'thread');
    }
  }

  /** Display names of the owner and joined members, only when classmates joined (else undefined). */
  private async writers(t: ThreadRow): Promise<Record<string, string> | undefined> {
    if (!t.members?.length) return undefined;
    const ids = [t.owner_id, ...t.members];
    const r = await this.supa.db.from('room_members').select('user_id, display_name').eq('room_id', t.room_id).in('user_id', ids);
    return Object.fromEntries((r.data ?? []).map((m) => [m.user_id as string, m.display_name as string]));
  }

  /** Back to class (or decline an offer). The client shows the catch-up card from left_main_seq. */
  async close(threadId: string, userId: string): Promise<void> {
    const t = await this.owned(threadId, userId);
    if (t.status === 'closed') return;
    await this.store.update(t.id, { status: 'closed' });
    void this.conductor.for(t.room_id).membersChanged();
  }

  /** Share to class: the thread's best answer becomes an answered cluster in the rail. */
  async share(threadId: string, userId: string, markdown?: string): Promise<ClusterRow> {
    const t = await this.owned(threadId, userId);
    await this.requireWriter(t, userId);
    let answer = markdown?.trim();
    if (!answer) {
      const chats = (await this.events.after(t.stream_id)).filter((e) => e.kind === 'chat');
      const tutorLines = chats.map((e) => e.data as StreamEventDataOf<'chat'>).filter((d) => d.role === 'tutor' && d.markdown !== greeting(t.topic) && d.markdown !== THREAD_ERROR);
      answer = tutorLines.at(-1)?.markdown;
    }
    if (!answer) throw new ConflictException('nothing to share yet');
    answer = answer.slice(0, 2000);
    const cluster = must(await this.supa.db.from('clusters').insert({
      room_id: t.room_id, title: t.topic, route: 'inline', answer, answered: true, asker_count: 1,
    }).select('*').single(), 'share thread') as ClusterRow;
    await this.store.update(t.id, { shared_answer: answer });
    return cluster;
  }
}
