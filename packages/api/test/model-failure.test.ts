// packages/api/test/model-failure.test.ts
// What the class shows when the model fails (there is no scripted tutor): the lead tutor retries
// a segment, then holds the class with a notice until the host presses Resume; the room budget
// holds the class; a failed thread reply posts a short visible error. Fakes only, no network.
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import type { BoardStep, LessonPlan } from '@chalk/schema';

// config.ts reads these at import; nothing here talks to a database or a model
vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://127.0.0.1:1';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test';
  process.env.PIPELINE = '0';
});
const { RoomConductor, TEACH_FAILED, BUDGET_REACHED } = await import('../src/conductor/room-conductor');
const { BudgetExceeded, MeteredModel, UsageMeter } = await import('../src/agents/metered.model');
const { ThreadsService, THREAD_ERROR } = await import('../src/threads/threads.service');
const { ModelPort } = await import('../src/agents/model.port');
type ModelEvent = import('../src/agents/model.port').ModelEvent;
type ModelRequest = import('../src/agents/model.port').ModelRequest;
type TeachChunk = import('../src/agents/lead-tutor.agent').TeachChunk;

const PLAN: LessonPlan = { topic: 'PDAs', segments: [{ title: 'What is a PDA?', objective: 'Explain PDAs.' }, { title: 'Bumps', objective: 'Explain bumps.' }] };
const STEPS: BoardStep[] = [{ add: { id: 'pda', kind: 'box', text: 'PDA' } }, { say: 'A PDA has no private key.' }];

/** Any Supabase query: chainable, resolves to an empty result. */
function emptyDb(): unknown {
  const q: unknown = new Proxy(() => undefined, {
    get: (_t, p) => (p === 'then' ? (ok: (v: unknown) => unknown) => ok({ data: [], error: null, count: 0 }) : () => q),
  });
  return q;
}

/** One try of the lead tutor's teach(): draw these steps, then optionally throw. */
type Try = { steps?: BoardStep[]; fail?: Error };

function setup(tries: Try[]) {
  let room = { id: 'room-1', title: 'PDAs', phase: 'lobby', segment: 0, main_stream_id: 'main', gate_held: false, gate_deadline: null as string | null, lesson_plan: null as LessonPlan | null, course_id: null };
  const events: { kind: string; data: Record<string, unknown> }[] = [];
  let teachCalls = 0;
  const lead = {
    plan: async () => PLAN,
    async *teach(): AsyncGenerator<TeachChunk> {
      const t = tries[teachCalls++] ?? { steps: STEPS };
      if (t.steps) yield { steps: t.steps };
      if (t.fail) throw t.fail;
    },
  };
  const conductor = new RoomConductor('room-1', {
    supa: { db: emptyDb() },
    events: { append: async (_s: string, kind: string, data: Record<string, unknown>) => { events.push({ kind, data }); return { seq: events.length }; }, after: async () => [] },
    rooms: {
      get: async () => ({ ...room }),
      update: async (_id: string, patch: object) => { room = { ...room, ...patch }; return { ...room }; },
      activeMembers: async () => [{ user_id: 'ana' }],
      prefixOf: async () => 'PREFIX',
      syllabusOf: async () => null,
    },
    lead,
    triage: { runNow: async () => undefined },
    scribe: { summarize: async () => 'Summary.' },
    retrieve: { known: async () => new Map(), context: async () => ({ text: '', passages: [] }) },
    ingest: { indexNow: async () => undefined },
    owns: async () => true,
    ended: () => undefined,
    retryDelaysMs: [0, 0],
  } as never);
  const settle = () => vi.waitFor(() => expect(conductor.idle).toBe(true));
  return { conductor, events, room: () => room, teachCalls: () => teachCalls, settle };
}

const notices = (events: { kind: string; data: Record<string, unknown> }[]) => events.filter((e) => e.kind === 'notice').map((e) => e.data.text);

describe('lead tutor failure', () => {
  it('retries a failed segment before anything is drawn and teaches it without a notice', async () => {
    const s = setup([{ fail: new Error('503 overloaded') }]);
    await s.conductor.start();
    await s.settle();
    expect(s.teachCalls()).toBe(2);
    expect(s.events.filter((e) => e.kind === 'board')).toHaveLength(1);
    expect(notices(s.events)).toEqual([]);
    expect(s.room()).toMatchObject({ phase: 'check', gate_held: false });
  });

  it('after three failed tries holds the class with a notice, and Resume teaches the segment again', async () => {
    const down = { fail: new Error('503 overloaded') };
    const s = setup([down, down, down]);
    await s.conductor.start();
    await s.settle();
    expect(s.teachCalls()).toBe(3);
    expect(notices(s.events)).toEqual([TEACH_FAILED]);
    expect(s.room()).toMatchObject({ phase: 'check', segment: 0, gate_held: true });
    expect(s.events.map((e) => e.kind)).toEqual(['segment_start', 'segment_end', 'notice']);

    await s.conductor.host('resume');
    await s.settle();
    expect(s.teachCalls()).toBe(4);
    expect(s.events.filter((e) => e.kind === 'segment_start').map((e) => e.data.segment)).toEqual([0, 0]);
    expect(s.events.filter((e) => e.kind === 'board')).toHaveLength(1);
    expect(s.room()).toMatchObject({ phase: 'check', segment: 0, gate_held: false });
  });

  it('does not retry once learners saw part of the segment: it holds at once', async () => {
    const s = setup([{ steps: STEPS, fail: new Error('stream cut') }]);
    await s.conductor.start();
    await s.settle();
    expect(s.teachCalls()).toBe(1);
    expect(notices(s.events)).toEqual([TEACH_FAILED]);
    expect(s.room()).toMatchObject({ phase: 'check', gate_held: true });
  });

  it('holds the class when the room budget is reached, without retrying', async () => {
    const s = setup([{ fail: new BudgetExceeded('room-1') }]);
    await s.conductor.start();
    await s.settle();
    expect(s.teachCalls()).toBe(1);
    expect(notices(s.events)).toEqual([BUDGET_REACHED]);
    expect(s.room()).toMatchObject({ phase: 'check', gate_held: true });
  });
});

describe('room token budget', () => {
  class Scripted extends ModelPort {
    readonly name = 'scripted';
    async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
      yield { type: 'tool', name: req.tool.name, input: 'ok' };
      yield { type: 'done', stopReason: 'tool_use', usage: { input: 600, output: 0, cacheRead: 0, cacheWrite: 0 } };
    }
  }
  const req = (roomId: string) => ({ agent: 'lead', roomId, prefix: '', system: '', messages: [], tool: { name: 'x', description: '', input_schema: {} } }) as ModelRequest;

  it('throws BudgetExceeded once a room spent its budget, per room', async () => {
    const model = new MeteredModel(new Scripted(), new UsageMeter(), () => undefined, { tokens: 1000 });
    expect(await model.call(req('r1'))).toBe('ok'); // 600
    expect(await model.call(req('r1'))).toBe('ok'); // 1200: now over
    await expect(model.call(req('r1'))).rejects.toBeInstanceOf(BudgetExceeded);
    expect(await model.call(req('r2'))).toBe('ok');
  });
});

describe('thread tutor failure', () => {
  it('posts a short visible error in the thread instead of a reply', async () => {
    const thread = { id: 't1', room_id: 'room-1', owner_id: 'ana', members: [], stream_id: 'ts', status: 'open', topic: 'Bumps' };
    const posted: { kind: string; data: Record<string, unknown> }[] = [];
    const svc = new ThreadsService(
      { db: emptyDb() } as never,
      { append: async (_s: string, kind: string, data: Record<string, unknown>) => { posted.push({ kind, data }); return { seq: posted.length }; }, after: async () => [] } as never,
      { get: async () => ({ id: 'room-1', main_stream_id: 'main' }), member: async () => ({ banned: false }), prefixOf: async () => 'PREFIX' } as never,
      { get: async () => thread } as never,
      { reply: async () => { throw new Error('model down'); } } as never,
      {} as never,
      { context: async () => ({ text: '', passages: [] }), known: async () => new Map() } as never,
    );
    await svc.message('t1', 'ana', 'How is the bump chosen?');
    await vi.waitFor(() => expect(posted).toHaveLength(2));
    expect(posted[1]).toEqual({ kind: 'chat', data: { role: 'tutor', markdown: THREAD_ERROR } });
  });
});
