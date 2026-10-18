// lane L: replays of finished classes, booking the next session, kudos.
// Reads go through the service role (the API checks who may see what); every write is here.
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { Api, ClusterRow, KudosRes, MemberRow, QuestionRow, ReplayCard, ReplayRes, RoomRow, StreamEvent, ThreadRow } from '@chalk/schema';
import { SupabaseService, allRows, must } from '../core/supabase.service';
import { EventsService } from '../core/events.service';
import { RoomsService } from '../rooms/rooms.service';
import { ProfilesService } from '../accounts/profiles.service';
import { buildChapters, countKudos, minutesBetween, nextTopicId } from './library.logic';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const inviteCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
const REPLAYS_MAX = 60;
const CHAPTER_KINDS = ['segment_start', 'answer_cluster'];

@Injectable()
export class LibraryService {
  constructor(private supa: SupabaseService, private events: EventsService, private rooms: RoomsService, private profiles: ProfilesService) {}

  private get db() { return this.supa.db; }

  /** Finished public classes, newest first. */
  async replays(): Promise<ReplayCard[]> {
    const rooms = must(await this.db.from('rooms').select('*, course:courses(title)')
      .eq('visibility', 'public').eq('phase', 'ended').not('ended_at', 'is', null)
      .order('ended_at', { ascending: false }).limit(REPLAYS_MAX), 'replays') as (RoomRow & { course: { title: string } | null })[];
    if (!rooms.length) return [];
    const ids = rooms.map((r) => r.id);
    // chapter marks of up to 60 classes pass the 1000-row cap: read them a page at a time
    const [hosts, marked] = await Promise.all([
      this.db.from('room_members').select('room_id, user_id, display_name').in('room_id', ids),
      allRows<{ room_id: string; stream_id: string }>((from, to) => this.db.from('events').select('room_id, stream_id').in('room_id', ids).in('kind', CHAPTER_KINDS)
        .order('stream_id').order('seq').range(from, to), 'chapters'),
    ]);
    if (hosts.error) throw new Error(hosts.error.message);
    const marks = { data: marked };
    const main = new Map(rooms.map((r) => [r.id, r.main_stream_id]));
    const chapters = new Map<string, number>();
    for (const m of marks.data ?? []) if (main.get(m.room_id) === m.stream_id) chapters.set(m.room_id, (chapters.get(m.room_id) ?? 0) + 1);
    const hostName = (r: RoomRow) => (hosts.data ?? []).find((m) => m.room_id === r.id && m.user_id === r.host_id)?.display_name ?? '';
    return rooms.map((r) => ({
      id: r.id, title: r.title, course_title: r.course?.title ?? null, ended_at: r.ended_at!,
      minutes: minutesBetween(r.started_at, r.ended_at), chapters: chapters.get(r.id) ?? 0, host_name: hostName(r),
    }));
  }

  /** Members (not removed) may replay their class; anyone signed in may replay a finished public one. */
  async replay(roomId: string, userId: string): Promise<ReplayRes> {
    const room = await this.rooms.get(roomId);
    const member = await this.rooms.member(roomId, userId);
    const open = room.visibility === 'public' && room.phase === 'ended';
    if (member?.banned || (!member && !open)) throw new ForbiddenException('this replay is not open to you');
    const events: StreamEvent[] = [];
    if (room.main_stream_id) {
      for (let after = 0; ;) {
        const page = await this.events.after(room.main_stream_id, after, 1000);
        events.push(...page);
        if (page.length < 1000) break;
        after = page[page.length - 1].seq;
      }
    }
    return { room, events, chapters: buildChapters(events) };
  }

  /**
   * Book the next session of this group: a new room with the same course and visibility, the
   * syllabus continuing after the topic taught. Booking again while the next room still waits
   * in its lobby moves that booking instead of making a second room.
   */
  /** `created`: false when an existing booking was moved. */
  async next(roomId: string, userId: string, body: z.infer<typeof Api.nextSession>): Promise<{ room: RoomRow; created: boolean }> {
    const room = await this.rooms.requireHost(roomId, userId);
    const title = body.title?.trim() || room.title;
    if (room.next_room_id) {
      const r = await this.db.from('rooms').select('*').eq('id', room.next_room_id).maybeSingle();
      if (r.error) throw new Error(`next session: ${r.error.message}`);
      const booked = r.data as RoomRow | null;
      if (booked && booked.phase === 'lobby' && booked.host_id === userId) {
        return { room: await this.rooms.update(booked.id, { starts_at: body.startsAt, title }), created: false };
      }
      if (booked && booked.phase !== 'ended') throw new ConflictException('the next session has already started');
    }
    const topicId = room.course_id ? nextTopicId(await this.rooms.syllabusOf(room), room.topic_id) : null;
    let created: RoomRow | null = null;
    for (let i = 0; i < 5 && !created; i++) {
      const r = await this.db.from('rooms').insert({
        title, goal: room.goal, course_id: room.course_id, topic_id: topicId, host_id: userId,
        visibility: room.visibility, seats: room.seats, invite_code: inviteCode(), starts_at: body.startsAt,
      }).select('*').single();
      if (r.error?.code === '23505') continue; // invite code collision
      created = must(r, 'book next session') as RoomRow;
    }
    if (!created) throw new ConflictException('could not allocate an invite code');
    const streamId = await this.events.createStream(created.id, 'main');
    created = await this.rooms.update(created.id, { main_stream_id: streamId });
    const me = await this.rooms.member(roomId, userId);
    const who = me ?? await this.identity(userId);
    must(await this.db.from('room_members').insert({
      room_id: created.id, user_id: userId, role: 'host', display_name: who.display_name, color: who.color,
    }).select('*').single(), 'add host');
    await this.rooms.update(roomId, { next_room_id: created.id });
    return { room: created, created: true };
  }

  private async identity(userId: string): Promise<Pick<MemberRow, 'display_name' | 'color'>> {
    const p = await this.profiles.get(userId);
    return { display_name: p.display_name, color: p.color };
  }

  /** How my questions and threads helped others, across every class I was in. */
  async kudos(userId: string): Promise<KudosRes> {
    const [qs, ths] = await Promise.all([
      this.db.from('questions').select('author_id, cluster_id, votes').eq('author_id', userId).not('cluster_id', 'is', null),
      this.db.from('threads').select('owner_id, shared_answer').eq('owner_id', userId).not('shared_answer', 'is', null),
    ]);
    if (qs.error) throw new Error(qs.error.message);
    if (ths.error) throw new Error(ths.error.message);
    const questions = (qs.data ?? []) as Pick<QuestionRow, 'author_id' | 'cluster_id' | 'votes'>[];
    const ids = [...new Set(questions.map((q) => q.cluster_id!))];
    let clusters: Pick<ClusterRow, 'id' | 'route' | 'answered' | 'asker_count'>[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const r = await this.db.from('clusters').select('id, route, answered, asker_count').in('id', ids.slice(i, i + 200));
      if (r.error) throw new Error(r.error.message);
      clusters = clusters.concat(r.data ?? []);
    }
    return countKudos(userId, questions, clusters, (ths.data ?? []) as Pick<ThreadRow, 'owner_id' | 'shared_answer'>[]);
  }
}
