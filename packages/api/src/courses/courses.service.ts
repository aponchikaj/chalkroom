// lane C: course catalog, course pages, fork, ratings, FAQ, the lobby of public rooms.
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import type { Api, CourseCard, CourseRow, FaqRow, LobbyRoom, Phase } from '@chalk/schema';
import { SupabaseService, allRows, must } from '../core/supabase.service';
import { ModelPort } from '../agents/model.port';
import { mergeFaq } from '../triage/faq-match';
import { draftSyllabus, hasTopics } from './syllabus-draft';
import { lobbyOrder, searchTerm, toCards, type RatingRow } from './catalog';

const NO_TOPICS = 'the syllabus needs at least one topic line, like "- [ ] Topic title"';

@Injectable()
export class CoursesService {
  constructor(private supa: SupabaseService, private model: ModelPort) {}

  private get db() { return this.supa.db; }

  private async cards(rows: CourseRow[], me: string): Promise<CourseCard[]> {
    if (!rows.length) return [];
    const ids = rows.map((c) => c.id);
    const ownerIds = [...new Set(rows.map((c) => c.owner_id).filter((x): x is string => !!x))];
    // rooms run and ratings of up to 100 courses pass the 1000-row cap: read them a page at a time
    const [owners, roomRows, ratingRows] = await Promise.all([
      ownerIds.length ? this.db.from('profiles').select('id, display_name').in('id', ownerIds) : Promise.resolve({ data: [], error: null }),
      allRows<{ course_id: string }>((from, to) => this.db.from('rooms').select('course_id').in('course_id', ids).not('started_at', 'is', null).order('id').range(from, to), 'rooms run'),
      allRows<RatingRow>((from, to) => this.db.from('course_ratings').select('course_id, user_id, stars').in('course_id', ids).order('course_id').order('user_id').range(from, to), 'ratings'),
    ]);
    if (owners.error) throw new Error(owners.error.message);
    const rooms = { data: roomRows };
    const ratings = { data: ratingRows };
    const counts = new Map<string, number>();
    for (const r of (rooms.data ?? []) as { course_id: string }[]) counts.set(r.course_id, (counts.get(r.course_id) ?? 0) + 1);
    const names = new Map(((owners.data ?? []) as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]));
    return toCards(rows, names, counts, (ratings.data ?? []) as RatingRow[], me);
  }

  /** Public courses and my private ones; q searches title and goal. */
  async list(me: string, q?: string): Promise<CourseCard[]> {
    let query = this.db.from('courses').select('*').or(`visibility.eq.public,owner_id.eq.${me}`);
    const term = searchTerm(q);
    if (term) query = query.or(`title.ilike.%${term}%,goal.ilike.%${term}%`);
    const rows = must(await query.order('created_at', { ascending: false }).limit(100), 'courses') as CourseRow[];
    const cards = await this.cards(rows, me);
    // mine first, then the most used and best rated
    return cards.sort((a, b) => Number(b.owner_id === me) - Number(a.owner_id === me) || b.rooms_run - a.rooms_run || (b.rating ?? 0) - (a.rating ?? 0));
  }

  /** A course the caller may read: public, or theirs. */
  async readable(id: string, me: string): Promise<CourseRow> {
    const r = await this.db.from('courses').select('*').eq('id', id).maybeSingle();
    if (r.error) throw new Error(r.error.message);
    const c = r.data as CourseRow | null;
    if (!c || (c.visibility !== 'public' && c.owner_id !== me)) throw new NotFoundException('course not found');
    return c;
  }

  async card(id: string, me: string): Promise<CourseCard> {
    return (await this.cards([await this.readable(id, me)], me))[0];
  }

  async faq(id: string, me: string): Promise<FaqRow[]> {
    await this.readable(id, me);
    const rows = must(await this.db.from('faq').select('*').eq('course_id', id).limit(500), 'faq') as FaqRow[];
    return mergeFaq(rows);
  }

  async create(me: string, b: z.infer<typeof Api.createCourse>): Promise<CourseRow> {
    const goal = b.goal?.trim() ?? '';
    let syllabus = b.syllabusMd?.trim() ?? '';
    if (syllabus && !hasTopics(syllabus)) throw new BadRequestException(NO_TOPICS);
    if (!syllabus) syllabus = await draftSyllabus(this.model, b.title, goal);
    return must(await this.db.from('courses').insert({
      title: b.title, goal, syllabus_md: syllabus, visibility: b.visibility, owner_id: me,
    }).select('*').single(), 'create course') as CourseRow;
  }

  async update(id: string, me: string, b: z.infer<typeof Api.updateCourse>): Promise<CourseRow> {
    const c = await this.readable(id, me);
    if (c.owner_id !== me) throw new ForbiddenException('only the owner can edit this course');
    if (b.syllabusMd !== undefined && !hasTopics(b.syllabusMd)) throw new BadRequestException(NO_TOPICS);
    const patch = Object.fromEntries(Object.entries({ title: b.title, goal: b.goal?.trim(), syllabus_md: b.syllabusMd?.trim(), visibility: b.visibility }).filter(([, v]) => v !== undefined));
    if (!Object.keys(patch).length) return c;
    return must(await this.db.from('courses').update(patch).eq('id', id).select('*').single(), 'update course') as CourseRow;
  }

  /** A private copy owned by the caller. */
  async fork(id: string, me: string, b: z.infer<typeof Api.forkCourse>): Promise<CourseRow> {
    const c = await this.readable(id, me);
    return must(await this.db.from('courses').insert({
      title: b.title ?? c.title, goal: c.goal, syllabus_md: c.syllabus_md, visibility: 'private', owner_id: me, forked_from: c.id,
    }).select('*').single(), 'fork course') as CourseRow;
  }

  async rate(id: string, me: string, stars: number): Promise<void> {
    await this.readable(id, me);
    const r = await this.db.from('course_ratings').upsert({ course_id: id, user_id: me, stars, updated_at: new Date().toISOString() });
    if (r.error) throw new Error(r.error.message);
  }

  async lobby(): Promise<LobbyRoom[]> {
    const since = new Date(Date.now() - 12 * 3600_000).toISOString();
    const now = new Date().toISOString();
    const rooms = must(await this.db.from('rooms').select('id, title, course_id, phase, seats, starts_at, host_id, invite_code, created_at, started_at')
      .eq('visibility', 'public').in('phase', ['lobby', 'teaching', 'check', 'qa'])
      .or(`created_at.gte.${since},starts_at.gte.${now}`)
      .order('created_at', { ascending: false }).limit(100), 'lobby') as {
      id: string; title: string; course_id: string | null; phase: Phase; seats: number; starts_at: string | null; host_id: string; invite_code: string; created_at: string; started_at: string | null;
    }[];
    if (!rooms.length) return [];
    const courseIds = [...new Set(rooms.map((r) => r.course_id).filter((x): x is string => !!x))];
    const [members, courses] = await Promise.all([
      this.db.from('room_members').select('room_id, user_id, display_name, left_at, banned').in('room_id', rooms.map((r) => r.id)),
      courseIds.length ? this.db.from('courses').select('id, title, visibility').in('id', courseIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (members.error) throw new Error(members.error.message);
    if (courses.error) throw new Error(courses.error.message);
    const ms = (members.data ?? []) as { room_id: string; user_id: string; display_name: string; left_at: string | null; banned?: boolean }[];
    // a private course's title stays private even when a room of it is public
    const titles = new Map(((courses.data ?? []) as { id: string; title: string; visibility: string }[]).filter((c) => c.visibility === 'public').map((c) => [c.id, c.title]));
    return lobbyOrder(rooms.map((r) => {
      const here = ms.filter((m) => m.room_id === r.id);
      return {
        id: r.id, title: r.title, course_id: r.course_id, course_title: r.course_id ? titles.get(r.course_id) ?? null : null,
        phase: r.phase, seats: r.seats, taken: here.filter((m) => !m.left_at && !m.banned).length, starts_at: r.starts_at,
        host_name: here.find((m) => m.user_id === r.host_id)?.display_name ?? '', invite_code: r.invite_code,
        created_at: r.created_at, started_at: r.started_at,
      };
    }));
  }
}
