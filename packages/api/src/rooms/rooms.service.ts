// Rooms, membership and the learner actions that go through REST (validate → DB → broadcast).
import { randomInt } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import { gradeItem, type Api, type MemberRow, type Question, type RoomPreview, type RoomRow } from '@chalk/schema';
import { SupabaseService, must } from '../core/supabase.service';
import { EventsService } from '../core/events.service';
import { config } from '../config';
import { ProfilesService } from '../accounts/profiles.service';
import { roomPrefix } from '../agents/prompts';
import { pickSuccessor } from '../presence/presence-tracker';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const inviteCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
/** The seat trigger (enforce_seats) refuses a member who would make the room overfull. */
const roomFull = (e: { message?: string; hint?: string } | null) => !!e && (e.hint === 'room_full' || /room is full/.test(e.message ?? ''));

@Injectable()
export class RoomsService {
  constructor(private supa: SupabaseService, private events: EventsService, private profiles: ProfilesService) {}

  /** Name and color for a room: the body's if given, else the profile's. */
  private async identity(userId: string, body: { displayName?: string; color?: string }) {
    if (body.displayName && body.color) return { displayName: body.displayName, color: body.color };
    const p = await this.profiles.get(userId);
    return { displayName: body.displayName ?? p.display_name, color: body.color ?? p.color };
  }

  private get db() { return this.supa.db; }

  async get(roomId: string): Promise<RoomRow> {
    const r = await this.db.from('rooms').select('*').eq('id', roomId).maybeSingle();
    if (r.error) throw new Error(r.error.message);
    if (!r.data) throw new NotFoundException('room not found');
    return r.data as RoomRow;
  }

  async update(roomId: string, patch: Partial<RoomRow>): Promise<RoomRow> {
    return must(await this.db.from('rooms').update(patch).eq('id', roomId).select('*').single(), 'update room') as RoomRow;
  }

  async member(roomId: string, userId: string): Promise<MemberRow | null> {
    const r = await this.db.from('room_members').select('*').eq('room_id', roomId).eq('user_id', userId).maybeSingle();
    if (r.error) throw new Error(r.error.message);
    return r.data as MemberRow | null;
  }

  async requireMember(roomId: string, userId: string): Promise<MemberRow> {
    const m = await this.member(roomId, userId);
    if (!m) throw new ForbiddenException('not a member of this room');
    if (m.banned) throw new ForbiddenException('you were removed from this room');
    return m;
  }

  async requireHost(roomId: string, userId: string): Promise<RoomRow> {
    const room = await this.get(roomId);
    if (room.host_id !== userId) throw new ForbiddenException('only the host can do this');
    return room;
  }

  /** Every member, including those who left. */
  async allMembers(roomId: string): Promise<MemberRow[]> {
    return must(await this.db.from('room_members').select('*').eq('room_id', roomId), 'members') as MemberRow[];
  }

  async setPresence(roomId: string, back: string[], gone: string[]) {
    // one at a time: the seat trigger may refuse one member coming back to a full room
    for (const userId of back) await this.db.from('room_members').update({ left_at: null }).eq('room_id', roomId).eq('user_id', userId).not('left_at', 'is', null);
    if (gone.length) await this.db.from('room_members').update({ left_at: new Date().toISOString() }).eq('room_id', roomId).in('user_id', gone).is('left_at', null);
  }

  /** If the host is gone, the longest-present member takes over (design doc: Pacing). */
  async handOffHost(roomId: string): Promise<MemberRow | null> {
    const room = await this.get(roomId);
    if (room.phase === 'ended') return null;
    const active = await this.activeMembers(roomId);
    if (active.some((m) => m.user_id === room.host_id)) return null;
    const next = pickSuccessor(active, room.host_id);
    if (!next) return null;
    await this.update(roomId, { host_id: next.user_id });
    await this.db.from('room_members').update({ role: 'learner' }).eq('room_id', roomId).eq('user_id', room.host_id);
    await this.db.from('room_members').update({ role: 'host' }).eq('room_id', roomId).eq('user_id', next.user_id);
    await this.events.append(room.main_stream_id, 'notice', { text: `${next.display_name} is now the host.`, level: 'info' }, 'system');
    return next;
  }

  /** Members currently in the room (joined, not left). */
  async activeMembers(roomId: string): Promise<MemberRow[]> {
    return must(await this.db.from('room_members').select('*').eq('room_id', roomId).is('left_at', null), 'members') as MemberRow[];
  }

  /** The cached prefix every agent of this room shares. Byte-stable across calls. */
  async prefixOf(room: RoomRow, opts: { board?: boolean } = {}): Promise<string> {
    return roomPrefix({ title: room.title, goal: room.goal, syllabus: await this.syllabusOf(room) }, room.lesson_plan, opts);
  }

  async syllabusOf(room: RoomRow): Promise<string | undefined> {
    if (!room.course_id) return undefined;
    const r = await this.db.from('courses').select('syllabus_md').eq('id', room.course_id).maybeSingle();
    return (r.data?.syllabus_md as string | undefined) || undefined;
  }

  async create(userId: string, body: z.infer<typeof Api.createRoom>) {
    const { displayName, color } = await this.identity(userId, body);
    let room: RoomRow | null = null;
    for (let i = 0; i < 5 && !room; i++) {
      const r = await this.db.from('rooms').insert({
        title: body.title, goal: body.goal ?? '', course_id: body.courseId ?? null, topic_id: body.topicId ?? null,
        host_id: userId, visibility: body.visibility, invite_code: inviteCode(),
      }).select('*').single();
      if (r.error?.code === '23505') continue; // invite code collision
      room = must(r, 'create room') as RoomRow;
    }
    if (!room) throw new ConflictException('could not allocate an invite code');
    const streamId = await this.events.createStream(room.id, 'main');
    room = await this.update(room.id, { main_stream_id: streamId });
    must(await this.db.from('room_members').insert({ room_id: room.id, user_id: userId, role: 'host', display_name: displayName, color }).select('*').single(), 'add host');
    return { room, inviteUrl: `${config.webUrl}/r/${room.invite_code}` };
  }

  async preview(code: string): Promise<RoomPreview> {
    const room = await this.byCode(code);
    const members = await this.activeMembers(room.id);
    const host = members.find((m) => m.user_id === room.host_id);
    return { id: room.id, title: room.title, phase: room.phase, seats: room.seats, taken: members.length, hostName: host?.display_name ?? '' };
  }

  private async byCode(code: string): Promise<RoomRow> {
    const r = await this.db.from('rooms').select('*').eq('invite_code', code.trim().toUpperCase()).maybeSingle();
    if (!r.data) throw new NotFoundException('no room with that code');
    return r.data as RoomRow;
  }

  async join(userId: string, body: z.infer<typeof Api.joinRoom>) {
    const room = await this.byCode(body.inviteCode);
    const { displayName, color } = await this.identity(userId, body);
    const existing = await this.member(room.id, userId);
    if (existing?.banned) throw new ForbiddenException('you were removed from this room');
    // the seat limit itself is the enforce_seats trigger (atomic, also on rejoin)
    const r = await this.db.from('room_members').upsert({
      room_id: room.id, user_id: userId, role: existing?.role ?? 'learner',
      display_name: displayName, color, left_at: null,
    }).select('*').single();
    if (roomFull(r.error)) throw new ConflictException('the room is full');
    const member = must(r, 'join') as MemberRow;
    return { room, member };
  }

  /** B6: mute (cannot ask), unmute, kick (banned: cannot rejoin or read the room). */
  async moderate(roomId: string, userId: string, action: 'mute' | 'unmute' | 'kick') {
    const patch = action === 'kick' ? { banned: true, left_at: new Date().toISOString() } : { muted: action === 'mute' };
    const r = await this.db.from('room_members').update(patch).eq('room_id', roomId).eq('user_id', userId).select('user_id');
    if (r.error) throw new Error(r.error.message);
    if (!r.data?.length) throw new NotFoundException('not a member of this room');
  }

  async leave(roomId: string, userId: string) {
    await this.db.from('room_members').update({ left_at: new Date().toISOString() }).eq('room_id', roomId).eq('user_id', userId);
  }

  async ready(roomId: string, userId: string, segment: number) {
    await this.requireMember(roomId, userId);
    const room = await this.get(roomId);
    if (room.phase !== 'check' || room.segment !== segment) throw new ConflictException('the ready gate is not open for that segment');
    const r = await this.db.from('ready_votes').upsert({ room_id: roomId, segment, user_id: userId }, { ignoreDuplicates: true });
    if (r.error) throw new Error(r.error.message);
  }

  async answerCheck(roomId: string, userId: string, checkId: string, answer: unknown) {
    await this.requireMember(roomId, userId);
    const r = await this.db.from('checks').select('*').eq('id', checkId).eq('room_id', roomId).maybeSingle();
    if (!r.data) throw new NotFoundException('unknown check');
    if (r.data.closed_at) throw new ConflictException('this check is closed');
    const result = gradeItem(r.data.question as Question, answer);
    const correct = result.gradedBy === 'pending' ? null : result.score >= 1;
    const w = await this.db.from('check_answers').upsert({ check_id: checkId, room_id: roomId, user_id: userId, answer, correct });
    if (w.error) throw new Error(w.error.message);
  }

  async react(roomId: string, userId: string, shapeId: string, kind: 'confused' | 'got_it') {
    await this.requireMember(roomId, userId);
    const cur = await this.db.from('reactions').select('kind').eq('room_id', roomId).eq('user_id', userId).eq('shape_id', shapeId).maybeSingle();
    if (cur.data?.kind === kind) await this.db.from('reactions').delete().eq('room_id', roomId).eq('user_id', userId).eq('shape_id', shapeId);
    else await this.db.from('reactions').upsert({ room_id: roomId, user_id: userId, shape_id: shapeId, kind });
  }
}
