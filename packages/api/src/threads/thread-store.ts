// packages/api/src/threads/thread-store.ts
// Thread rows and their streams. No conductor dependency, so triage can offer threads.
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { RoomRow, ThreadRow } from '@chalk/schema';
import { SupabaseService, must } from '../core/supabase.service';
import { EventsService } from '../core/events.service';

@Injectable()
export class ThreadStore {
  constructor(private supa: SupabaseService, private events: EventsService) {}

  private get db() { return this.supa.db; }

  async get(threadId: string): Promise<ThreadRow> {
    const r = await this.db.from('threads').select('*').eq('id', threadId).maybeSingle();
    if (r.error) throw new Error(r.error.message);
    if (!r.data) throw new NotFoundException('thread not found');
    return r.data as ThreadRow;
  }

  async update(threadId: string, patch: Partial<ThreadRow>): Promise<ThreadRow> {
    return must(await this.db.from('threads').update(patch).eq('id', threadId).select('*').single(), 'update thread') as ThreadRow;
  }

  async hasActive(roomId: string, ownerId: string, statuses: ThreadRow['status'][] = ['offered', 'open']): Promise<boolean> {
    const r = await this.db.from('threads').select('id').eq('room_id', roomId).eq('owner_id', ownerId).in('status', statuses).limit(1);
    return !!r.data?.length;
  }

  /** Triage route `thread`: an opt-in offer. One offer or open thread per learner at a time. */
  async offer(room: RoomRow, ownerId: string, topic: string): Promise<ThreadRow | null> {
    if (await this.hasActive(room.id, ownerId)) return null;
    const streamId = await this.events.createStream(room.id, 'thread');
    return must(await this.db.from('threads').insert({
      room_id: room.id, owner_id: ownerId, stream_id: streamId, topic: topic.slice(0, 120), status: 'offered',
    }).select('*').single(), 'offer thread') as ThreadRow;
  }

  async createOpen(room: RoomRow, ownerId: string, topic: string, leftMainSeq: number): Promise<ThreadRow> {
    if (await this.hasActive(room.id, ownerId, ['open'])) throw new ConflictException('you already have an open thread');
    const streamId = await this.events.createStream(room.id, 'thread');
    const r = await this.db.from('threads').insert({
      room_id: room.id, owner_id: ownerId, stream_id: streamId, topic: topic.slice(0, 120), status: 'open', left_main_seq: leftMainSeq,
    }).select('*').single();
    // threads_one_active: a parallel open won the race
    if (r.error?.code === '23505') throw new ConflictException('you already have an open thread');
    return must(r, 'open thread') as ThreadRow;
  }

  /** Main stream position, stored as left_main_seq for the catch-up card. */
  async mainSeq(room: RoomRow): Promise<number> {
    const r = must(await this.db.from('streams').select('last_seq').eq('id', room.main_stream_id).single(), 'main seq') as { last_seq: number };
    return Number(r.last_seq);
  }
}
