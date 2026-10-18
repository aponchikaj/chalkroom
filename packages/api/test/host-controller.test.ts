// packages/api/test/host-controller.test.ts (lane C): the host tooling endpoints against an
// in-memory database. No model, no network: pause holds the gate, host-only access, pin rules.
import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

// config.ts reads these at import; nothing here talks to a database
vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://127.0.0.1:1';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test';
});
const { HostController } = await import('../src/host/host.controller');

type Row = Record<string, unknown>;
const ROOM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const CHECK = '33333333-3333-4333-8333-333333333333';
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

/** A tiny chainable stand-in for the Supabase query builder (select, eq, neq, insert, update). */
function fakeDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const rows = (tables[table] ??= []);
      const filters: ((r: Row) => boolean)[] = [];
      let op: 'select' | 'insert' | 'update' = 'select';
      let payload: Row = {};
      let inserted: Row[] = [];
      let single: 'one' | 'maybe' | null = null;
      const run = () => {
        if (op === 'insert') return { data: single ? inserted[0] : inserted, error: null };
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (op === 'update') for (const r of hit) Object.assign(r, payload);
        if (single === 'one') return hit[0] ? { data: hit[0], error: null } : { data: null, error: { message: 'no row' } };
        if (single === 'maybe') return { data: hit[0] ?? null, error: null };
        return { data: hit, error: null };
      };
      const b = {
        select: () => b,
        eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; },
        neq: (k: string, v: unknown) => { filters.push((r) => r[k] !== v); return b; },
        insert: (row: Row) => { op = 'insert'; inserted = [{ id: uuid(), ...row }]; rows.push(...inserted); return b; },
        update: (p: Row) => { op = 'update'; payload = p; return b; },
        single: () => { single = 'one'; return b; },
        maybeSingle: () => { single = 'maybe'; return b; },
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
      };
      return b;
    },
  };
}

function setup(room: Partial<Row> = {}) {
  const tables: Record<string, Row[]> = {
    rooms: [{ id: ROOM, host_id: 'ana', phase: 'teaching', segment: 0, main_stream_id: 'main', gate_held: false, ...room }],
    room_members: [{ room_id: ROOM, user_id: 'ana', display_name: 'Ana' }, { room_id: ROOM, user_id: 'nika', display_name: 'Nika' }],
    questions: [], clusters: [], check_answers: [],
  };
  const notices: Row[] = [];
  const hostCalls: string[] = [];
  const rooms = {
    requireHost: async (id: string, user: string) => {
      const r = tables.rooms.find((x) => x.id === id)!;
      if (r.host_id !== user) throw new ForbiddenException('only the host can do this');
      return r;
    },
  };
  const conductor = { for: () => ({ host: async (a: string) => { hostCalls.push(a); } }) };
  const events = { append: async (_s: string, kind: string, data: Row) => { notices.push({ kind, ...data }); } };
  const c = new HostController({ db: fakeDb(tables) } as never, events as never, rooms as never, conductor as never);
  return { c, tables, notices, hostCalls };
}
const ana = { id: 'ana' } as never;
const nika = { id: 'nika' } as never;

describe('host control: pause holds the gate', () => {
  beforeEach(() => { n = 0; });
  it('pause holds a free gate and resume gives it back', async () => {
    const { c, notices, hostCalls } = setup();
    await c.control(ana, ROOM, { action: 'pause' });
    expect(hostCalls).toEqual(['hold']);
    await c.control(ana, ROOM, { action: 'resume' });
    expect(hostCalls).toEqual(['hold', 'resume']);
    expect(notices.map((x) => x.control)).toEqual(['pause', 'resume']);
  });
  it('resume keeps a hold that was there before the pause', async () => {
    const { c, hostCalls } = setup({ phase: 'check', gate_held: true });
    await c.control(ana, ROOM, { action: 'pause' });
    await c.control(ana, ROOM, { action: 'resume' });
    expect(hostCalls).toEqual([]);
  });
  it('a second pause does not forget who held the gate', async () => {
    const { c, tables, hostCalls } = setup();
    await c.control(ana, ROOM, { action: 'pause' });
    tables.rooms[0].gate_held = true; // the conductor applied the hold
    await c.control(ana, ROOM, { action: 'pause' });
    await c.control(ana, ROOM, { action: 'resume' });
    expect(hostCalls).toEqual(['hold', 'resume']);
  });
  it('skip while paused holds the next gate again', async () => {
    const { c, tables, hostCalls } = setup();
    await c.control(ana, ROOM, { action: 'pause' });
    tables.rooms[0].phase = 'check';
    await c.control(ana, ROOM, { action: 'skip' });
    expect(hostCalls).toEqual(['hold', 'skip', 'hold']);
  });
  it('refuses anyone but the host', async () => {
    const { c, hostCalls, notices } = setup();
    await expect(c.control(nika, ROOM, { action: 'pause' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(hostCalls).toEqual([]);
    expect(notices).toEqual([]);
  });
});

describe('host reexplain, pin and answers', () => {
  beforeEach(() => { n = 0; });
  it('reexplain and pin are host only', async () => {
    const { c } = setup();
    await expect(c.reexplain(nika, ROOM, { shapeIds: ['s1'] })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(c.pin(nika, ROOM, { questionId: OTHER })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(c.answers(nika, ROOM, CHECK)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('reexplain queues a class cluster with one grouped question', async () => {
    const { c, tables, notices } = setup();
    const r = await c.reexplain(ana, ROOM, { shapeIds: ['s1'], label: 'the bump' });
    expect(tables.clusters).toMatchObject([{ id: r.clusterId, route: 'class', room_id: ROOM }]);
    expect(tables.questions).toMatchObject([{ cluster_id: r.clusterId, status: 'grouped', author_id: 'ana' }]);
    expect(notices[0].control).toBe('reexplain');
  });
  it('pin refuses a question from another class', async () => {
    const { c, tables } = setup();
    tables.questions.push({ id: OTHER, room_id: 'elsewhere', text: 'Why?', status: 'pending', cluster_id: null });
    await expect(c.pin(ana, ROOM, { questionId: OTHER })).rejects.toBeInstanceOf(NotFoundException);
  });
  it('pin on an answered group sends it back to the class', async () => {
    const { c, tables } = setup();
    tables.clusters.push({ id: 'cl1', room_id: ROOM, title: 'Why 255?', route: 'thread', answered: true });
    tables.questions.push(
      { id: OTHER, room_id: ROOM, text: 'Why 255?', status: 'answered', cluster_id: 'cl1' },
      { id: 'q2', room_id: ROOM, text: 'And 256?', status: 'pending', cluster_id: 'cl1' },
    );
    const r = await c.pin(ana, ROOM, { questionId: OTHER });
    expect(r.clusterId).toBe('cl1');
    expect(tables.clusters[0]).toMatchObject({ route: 'class', answered: false });
    expect(tables.questions.map((q) => q.status)).toEqual(['grouped', 'pending']);
  });
  it('answers returns only that check in this class', async () => {
    const { c, tables } = setup();
    tables.check_answers.push(
      { room_id: ROOM, check_id: CHECK, user_id: 'nika', correct: true },
      { room_id: ROOM, check_id: 'other-check', user_id: 'gio', correct: false },
      { room_id: 'elsewhere', check_id: CHECK, user_id: 'mari', correct: false },
    );
    expect(await c.answers(ana, ROOM, CHECK)).toEqual([{ userId: 'nika', correct: true }]);
  });
});
