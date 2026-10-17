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
import { boardOf, chatHistory } from './thread-context';

const greeting = (topic: string) => `Let's dig into **${topic}**. What would you like to know?`;
const SORRY = 'I could not answer that just now. Try asking again in a moment.';

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
  ) {}

  private async owned(threadId: string, userId: string): Promise<ThreadRow> {
    const t = await this.store.get(threadId);
    if (t.owner_id !== userId) throw new ForbiddenException('only the thread owner can do this');
    return t;
  }

  async open(roomId: string, userId: string, body: z.infer<typeof Api.openThread>): Promise<ThreadRow> {
    await this.rooms.requireMember(roomId, userId);
    const room = await this.rooms.get(roomId);
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
    return thread;
  }

  /** Stores the learner line now; the tutor answers in the background, in order per thread. */
  async message(threadId: string, userId: string, text: string): Promise<void> {
    const t = await this.owned(threadId, userId);
    if (t.status !== 'open') throw new ConflictException('this thread is not open');
    const asked = await this.events.append(t.stream_id, 'chat', { role: 'learner', markdown: text, authorId: userId }, userId);
    const prev = this.lanes.get(threadId) ?? Promise.resolve();
    const next = prev.then(() => this.reply(t, text, asked.seq)).catch((e) => this.log.error(`thread ${threadId.slice(0, 8)}: ${(e as Error).stack ?? e}`));
    this.lanes.set(threadId, next);
  }

  private async reply(t: ThreadRow, text: string, askedSeq: number) {
    const room = await this.rooms.get(t.room_id);
    const [main, mine] = await Promise.all([this.events.after(room.main_stream_id), this.events.after(t.stream_id)]);
    try {
      const out = await this.tutor.reply({
        prefix: await this.rooms.prefixOf(room),
        mainBoard: describeBoard(boardOf(main)),
        topic: t.topic,
        history: chatHistory(mine.filter((e) => e.seq < askedSeq)),
      }, text);
      await this.events.append(t.stream_id, 'chat', { role: 'tutor', markdown: out.markdown }, 'thread');
      if (out.steps?.length) await this.events.append(t.stream_id, 'board', { steps: out.steps }, 'thread');
    } catch (e) {
      this.log.warn(`thread ${t.id.slice(0, 8)}: reply failed (${(e as Error).message})`);
      await this.events.append(t.stream_id, 'chat', { role: 'tutor', markdown: SORRY }, 'thread');
    }
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
    let answer = markdown?.trim();
    if (!answer) {
      const chats = (await this.events.after(t.stream_id)).filter((e) => e.kind === 'chat');
      const tutorLines = chats.map((e) => e.data as StreamEventDataOf<'chat'>).filter((d) => d.role === 'tutor' && d.markdown !== greeting(t.topic));
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
