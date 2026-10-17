// Pure helpers for the catalog and the lobby (no DB), unit-tested in test/courses-catalog.test.ts.
import type { CourseCard, CourseRow, LobbyRoom, Phase } from '@chalk/schema';

export interface RatingRow { course_id: string; user_id: string; stars: number }

/** Catalog cards: owner names, rooms run and the star mean (one decimal). */
export function toCards(courses: CourseRow[], owners: Map<string, string>, roomCounts: Map<string, number>, ratings: RatingRow[], me: string): CourseCard[] {
  return courses.map((c) => {
    const mine = ratings.filter((r) => r.course_id === c.id);
    const mean = mine.length ? Math.round((mine.reduce((s, r) => s + r.stars, 0) / mine.length) * 10) / 10 : null;
    return {
      ...c,
      owner_name: c.owner_id ? owners.get(c.owner_id) ?? null : null,
      rooms_run: roomCounts.get(c.id) ?? 0,
      rating: mean,
      ratings: mine.length,
      my_rating: mine.find((r) => r.user_id === me)?.stars ?? null,
    };
  });
}

/** Search text safe for a PostgREST `or` ilike filter (no commas, parentheses or wildcards). */
export const searchTerm = (q: string | undefined) => (q ?? '').replace(/[%_*,()\\.:"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

const LIVE: Phase[] = ['teaching', 'check', 'qa'];

/**
 * The lobby: open public rooms with free seats, starting soonest first, then live rooms.
 * A lobby room nobody is in counts only while its start time is still ahead.
 */
export function lobbyOrder(rooms: (LobbyRoom & { created_at: string; started_at: string | null })[], now = Date.now()): LobbyRoom[] {
  const open = rooms.filter((r) => {
    if (r.taken >= r.seats) return false;
    if (r.phase === 'lobby') return r.taken > 0 || (r.starts_at !== null && Date.parse(r.starts_at) > now);
    return LIVE.includes(r.phase) && r.taken > 0;
  });
  const waiting = open.filter((r) => r.phase === 'lobby').sort((a, b) => {
    const x = a.starts_at ? Date.parse(a.starts_at) : Infinity, y = b.starts_at ? Date.parse(b.starts_at) : Infinity;
    return x - y || b.created_at.localeCompare(a.created_at);
  });
  const live = open.filter((r) => r.phase !== 'lobby').sort((a, b) => (b.started_at ?? b.created_at).localeCompare(a.started_at ?? a.created_at));
  return [...waiting, ...live].map(({ created_at: _c, started_at: _s, ...r }) => r);
}
