// packages/api/test/courses-catalog.test.ts
import { describe, it, expect } from 'vitest';
import { mockSyllabus } from '@chalk/mock-tutor';
import { parseSyllabus, type CourseRow } from '@chalk/schema';
import { lobbyOrder, searchTerm, toCards } from '../src/courses/catalog';

const course = (id: string, owner: string | null = 'o1'): CourseRow =>
  ({ id, title: id, goal: '', syllabus_md: '', visibility: 'public', owner_id: owner, forked_from: null, created_at: '2026-10-18T10:00:00Z' });

describe('toCards', () => {
  it('adds owner, rooms run, mean rating and my rating', () => {
    const [a, b] = toCards([course('a'), course('b', null)], new Map([['o1', 'Ana']]), new Map([['a', 3]]),
      [{ course_id: 'a', user_id: 'me', stars: 5 }, { course_id: 'a', user_id: 'x', stars: 4 }, { course_id: 'a', user_id: 'y', stars: 4 }], 'me');
    expect(a).toMatchObject({ owner_name: 'Ana', rooms_run: 3, rating: 4.3, ratings: 3, my_rating: 5 });
    expect(b).toMatchObject({ owner_name: null, rooms_run: 0, rating: null, ratings: 0, my_rating: null });
  });
});

describe('searchTerm', () => {
  it('strips PostgREST filter syntax', () => {
    expect(searchTerm('a,b).or(x*')).toBe('a b or x');
    expect(searchTerm(undefined)).toBe('');
  });
});

describe('lobbyOrder', () => {
  const now = Date.parse('2026-10-18T12:00:00Z');
  const room = (id: string, phase: 'lobby' | 'teaching' | 'qa', taken: number, starts_at: string | null = null, seats = 5) =>
    ({ id, title: id, course_id: null, course_title: null, phase, seats, taken, starts_at, host_name: 'H', invite_code: 'ABCDEF', created_at: '2026-10-18T11:00:00Z', started_at: null });
  it('lists soonest starts first, then live rooms; drops full and empty past rooms', () => {
    const out = lobbyOrder([
      room('live', 'teaching', 2),
      room('later', 'lobby', 1, '2026-10-18T15:00:00Z'),
      room('soon', 'lobby', 0, '2026-10-18T12:30:00Z'),
      room('now', 'lobby', 2),
      room('full', 'qa', 5),
      room('stale', 'lobby', 0, '2026-10-18T09:00:00Z'),
      room('dead', 'teaching', 0),
    ], now);
    expect(out.map((r) => r.id)).toEqual(['soon', 'later', 'now', 'live']);
    expect(out[0]).not.toHaveProperty('created_at');
  });
});

describe('mockSyllabus', () => {
  it('drafts a parseable outline with unique ids', () => {
    const s = parseSyllabus(mockSyllabus('Linear algebra', 'Solve systems of equations.'));
    expect(s.title).toBe('Linear algebra');
    expect(s.topics.length).toBe(5);
    expect(new Set(s.topics.map((t) => t.id)).size).toBe(5);
    expect(s.topics.every((t) => t.status === 'todo')).toBe(true);
  });
});
