// packages/api/test/courses-catalog.test.ts
import { describe, it, expect } from 'vitest';
import { parseSyllabus, type CourseRow } from '@chalk/schema';
import { lobbyOrder, searchTerm, toCards } from '../src/courses/catalog';
import { DRAFT_FAILED, draftSyllabus } from '../src/courses/syllabus-draft';
import { ModelPort, type ModelEvent, type ModelRequest } from '../src/agents/model.port';

/** A model that answers with the given tool input, or throws when it is an Error. */
class FakeModel extends ModelPort {
  readonly name = 'fake';
  constructor(private input: unknown) { super(); }
  async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
    if (this.input instanceof Error) throw this.input;
    yield { type: 'tool', name: req.tool.name, input: this.input };
    yield { type: 'done', stopReason: 'tool_use' };
  }
}

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

describe('draftSyllabus', () => {
  const md = '# Linear algebra\n\nSolve systems of equations.\n\n- [ ] Vectors  <!-- id: vectors -->\n- [ ] Matrices  <!-- id: matrices, needs: vectors -->\n';
  it('returns the drafted outline when it parses', async () => {
    const s = parseSyllabus(await draftSyllabus(new FakeModel({ syllabusMd: md }), 'Linear algebra', 'Solve systems of equations.'));
    expect(s.title).toBe('Linear algebra');
    expect(s.topics.map((t) => t.id)).toEqual(['vectors', 'matrices']);
  });
  it('answers 503 with a plain message when the model fails or writes no topics (no scripted outline)', async () => {
    await expect(draftSyllabus(new FakeModel(new Error('down')), 'Linear algebra', '')).rejects.toMatchObject({ status: 503, message: DRAFT_FAILED });
    await expect(draftSyllabus(new FakeModel({ syllabusMd: '# Only a title here' }), 'Linear algebra', '')).rejects.toMatchObject({ status: 503 });
  });
});
