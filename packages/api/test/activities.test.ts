// Lane M: quiz duel scoring, grading and sequencing; teach-back timeouts; the activities agent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamEventData, type Question } from '@chalk/schema';
import { DUEL, DuelRun, leaderboard, mostMissed, scoreAnswer, spreadOf } from '../src/activities/duel';
import { TEACHBACK, TeachbackRun } from '../src/activities/teachback';
import { ActivitiesAgent, DuelQuestionIn } from '../src/agents/activities.agent';
import { ModelPort, type ModelEvent, type ModelRequest } from '../src/agents/model.port';

/** A model that answers every request with the tool input `answer` returns. */
class FakeModel extends ModelPort {
  readonly name = 'fake';
  calls: ModelRequest[] = [];
  constructor(private answer: (req: ModelRequest) => unknown) { super(); }
  async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
    this.calls.push(req);
    yield { type: 'tool', name: req.tool.name, input: this.answer(req) };
    yield { type: 'done', stopReason: 'tool_use' };
  }
}

const DUEL_ANSWER = {
  questions: [
    { type: 'mcq', prompt: 'Who can sign for a PDA?', options: ['Its key holder', 'Its program'], answer: 1, topic: 'Who signs for a PDA' },
    { type: 'tf', prompt: 'A PDA lies on the curve.', answer: false, topic: 'Off the curve' },
    { type: 'numeric', prompt: 'Which bump is tried first?', answer: 255, topic: 'The canonical bump' },
    { type: 'tf', prompt: 'The bump counts upward.', answer: false, topic: 'The canonical bump' },
    { type: 'mcq', prompt: 'What does invoke_signed re-derive?', options: ['A key', 'The PDA'], answer: 1, topic: 'Signing' },
    { type: 'tf', prompt: 'A program stores its PDA key.', answer: false, topic: 'Signing' },
  ],
};
const FEEDBACK_ANSWER = { markdown: 'Thank you, Ana. You got the heart of it.', missing: ['Only its program signs for it'], steps: [{ say: 'Here is what to add.' }] };

const qs: Question[] = [
  { id: 'd0', type: 'mcq', prompt: 'Who signs?', options: ['Key', 'Program'], answer: 1, difficulty: 2, topic: 'Who signs' },
  { id: 'd1', type: 'tf', prompt: 'On the curve?', answer: false, difficulty: 2, topic: 'Off the curve' },
  { id: 'd2', type: 'numeric', prompt: 'First bump?', answer: 255, difficulty: 2, topic: 'Canonical bump' },
];

describe('duel scoring', () => {
  it('gives 1000 for an instant right answer, 500 at the buzzer, 0 when wrong', () => {
    expect(scoreAnswer(1, 0, 0, 20_000)).toBe(1000);
    expect(scoreAnswer(1, 10_000, 0, 20_000)).toBe(750);
    expect(scoreAnswer(1, 20_000, 0, 20_000)).toBe(500);
    expect(scoreAnswer(1, 20_500, 0, 20_000)).toBe(500); // within grace
    expect(scoreAnswer(0, 0, 0, 20_000)).toBe(0);
  });
  it('builds the spread with the check keys and sorts the leaderboard', () => {
    expect(spreadOf([{ answer: 1, correct: true }, { answer: 0, correct: false }, { answer: 1, correct: true }]))
      .toEqual({ total: 3, correct: 2, counts: { '1': 2, '0': 1 } });
    const names: Record<string, string> = { a: 'Ana', b: 'Beka', c: 'Cira' };
    expect(leaderboard(new Map([['a', 500], ['b', 900], ['c', 500]]), (id) => names[id]).map((l) => l.name)).toEqual(['Beka', 'Ana', 'Cira']);
  });
  it('re-teaches the most missed concept, none when all were right', () => {
    const s = (correct: number, total: number) => ({ total, correct, counts: {} });
    expect(mostMissed([{ question: qs[0], spread: s(2, 2) }, { question: qs[1], spread: s(0, 2) }, { question: qs[2], spread: s(1, 2) }])).toBe('Off the curve');
    expect(mostMissed([{ question: qs[0], spread: s(2, 2) }])).toBeUndefined();
  });
});

describe('DuelRun sequencing', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-18T10:00:00Z')); });
  afterEach(() => vi.useRealTimers());

  function setup(present = ['a', 'b']) {
    const out: { kind: string; data: any }[] = [];
    const run = new DuelRun('duel-1', qs, 20, {
      emit: async (kind, data) => { StreamEventData[kind].parse(data); out.push({ kind, data }); },
      present: async () => present,
      nameOf: (id) => (id === 'a' ? 'Ana' : id === 'b' ? 'Beka' : 'Someone'),
    });
    return { run, out };
  }

  it('closes a question early once everyone answered, grades, and ends with the leaderboard', async () => {
    const { run, out } = setup();
    const done = run.run();
    await vi.advanceTimersByTimeAsync(0);
    expect(out.map((e) => e.kind)).toEqual(['duel_start', 'duel_question']);
    expect(out[1].data.question.answer).toBeUndefined(); // answers stay on the server

    await vi.advanceTimersByTimeAsync(2_000);
    expect(await run.answer('a', 0, 1)).toBeNull();
    expect(await run.answer('a', 0, 0)).toBe('twice');
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await run.answer('b', 0, 0)).toBeNull(); // wrong; everyone answered -> result
    await vi.advanceTimersByTimeAsync(0);
    const r0 = out.find((e) => e.kind === 'duel_result')!.data;
    expect(r0.spread).toEqual({ total: 2, correct: 1, counts: { '1': 1, '0': 1 } });
    expect(r0.answerText).toBe('Program');
    expect(r0.leaders).toEqual([{ userId: 'a', name: 'Ana', points: 950 }, { userId: 'b', name: 'Beka', points: 0 }]);
    expect(await run.answer('a', 0, 1)).toBe('closed');

    // pause, then question 2: nobody answers, the clock closes it
    await vi.advanceTimersByTimeAsync(DUEL.resultMs);
    expect(out.at(-1)!.kind).toBe('duel_question');
    expect(out.at(-1)!.data.index).toBe(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(out.at(-1)!.data.spread.total).toBe(0);

    await vi.advanceTimersByTimeAsync(DUEL.resultMs);
    await run.answer('a', 2, '255');
    await run.answer('b', 2, '255');
    await vi.advanceTimersByTimeAsync(0);
    await done;
    const end = out.at(-1)!;
    expect(end.kind).toBe('duel_end');
    expect(end.data.leaders[0]).toEqual({ userId: 'a', name: 'Ana', points: 1950 });
    // q1 had no answers (skipped), q2 all right: q0 (1 of 2) is the most missed
    expect(end.data.reteach).toBe('Who signs');
  });

  it('refuses answers to a question that is not open', async () => {
    const { run } = setup();
    void run.run();
    await vi.advanceTimersByTimeAsync(0);
    expect(await run.answer('a', 1, false)).toBe('closed');
    await vi.advanceTimersByTimeAsync(20_000 + DUEL.graceMs + 1);
    expect(await run.answer('a', 0, 1)).toBe('closed');
  });

  it('ends early when the class moved on', async () => {
    const out: string[] = [];
    let on = true;
    const run = new DuelRun('d', qs, 10, { emit: async (k) => { out.push(k); }, present: async () => ['a'], nameOf: () => 'A', stillOn: async () => on });
    const done = run.run();
    await vi.advanceTimersByTimeAsync(0);
    on = false;
    await vi.advanceTimersByTimeAsync(10_000 + DUEL.resultMs);
    await done;
    expect(out).toEqual(['duel_start', 'duel_question', 'duel_result', 'duel_end']);
  });
});

describe('TeachbackRun', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = () => {
    const out: { kind: string; data: any }[] = [];
    const run = new TeachbackRun('tb', 'Explain why a PDA has no private key.', {
      emit: async (kind, data) => { StreamEventData[kind].parse(data); out.push({ kind, data }); },
      critique: async (name, text) => ({ markdown: `Thank you, ${name.split(' ')[0]}.`, missing: /invoke_signed/.test(text) ? [] : ['Only its program signs for it'], steps: [{ say: 'Here is what to add.' }] }),
    });
    return { run, out };
  };

  it('first volunteer wins, only they explain, then the tutor responds and draws', async () => {
    const { run, out } = make();
    await run.start();
    expect(await run.volunteerAs('a', 'Ana Beridze')).toBe(true);
    expect(await run.volunteerAs('b', 'Beka')).toBe(false);
    expect(await run.explain('b', 'x')).toBe('not_volunteer');
    expect(await run.explain('a', 'It comes from seeds and the program id, so there is no private key.')).toBeNull();
    expect(await run.explain('a', 'again')).toBe('twice');
    await run.done;
    expect(out.map((e) => e.kind)).toEqual(['teachback_invite', 'teachback_volunteer', 'teachback_explanation', 'teachback_feedback', 'board']);
    const fb = out[3].data;
    expect(fb.markdown).toMatch(/Ana/);
    expect(fb.missing).toEqual(['Only its program signs for it']);
  });

  it('ends with a notice when nobody volunteers in 60 s', async () => {
    const { run, out } = make();
    await run.start();
    await vi.advanceTimersByTimeAsync(TEACHBACK.volunteerMs);
    await run.done;
    expect(out.at(-1)!.kind).toBe('notice');
  });

  it('ends with a notice when the volunteer writes nothing in 3 minutes', async () => {
    const { run, out } = make();
    await run.start();
    await vi.advanceTimersByTimeAsync(50_000);
    await run.volunteerAs('a', 'Ana');
    await vi.advanceTimersByTimeAsync(TEACHBACK.explainMs - 1);
    expect(out.at(-1)!.kind).toBe('teachback_volunteer');
    await vi.advanceTimersByTimeAsync(1);
    await run.done;
    expect(out.at(-1)!.data.text).toMatch(/Ana did not send/);
  });
});

describe('ActivitiesAgent', () => {
  it('writes graded duel questions from the tool call, capped at the count', async () => {
    const agent = new ActivitiesAgent(new FakeModel(() => DUEL_ANSWER));
    const q = await agent.writeDuel({ prefix: '', plan: null, segment: 0, summaries: [], count: 5 });
    expect(q).toHaveLength(5);
    expect(q.map((x) => x.id)).toEqual(['d0', 'd1', 'd2', 'd3', 'd4']);
    expect(q.every((x) => ['mcq', 'tf', 'numeric'].includes(x.type) && x.answer !== undefined && x.topic)).toBe(true);
  });

  it('rejects a duel question whose answer does not fit its type, and repairs once', async () => {
    expect(DuelQuestionIn.safeParse({ type: 'mcq', prompt: 'p', options: ['a', 'b'], answer: 2, topic: 't' }).success).toBe(false);
    expect(DuelQuestionIn.safeParse({ type: 'tf', prompt: 'p', answer: 1, topic: 't' }).success).toBe(false);
    let n = 0;
    const model = new FakeModel(() => (n++ === 0 ? { questions: [{ type: 'tf', prompt: 'p', answer: 'yes', topic: 't' }] } : DUEL_ANSWER));
    const q = await new ActivitiesAgent(model).writeDuel({ prefix: '', plan: null, segment: 2, summaries: [], count: 3 });
    expect(model.calls).toHaveLength(2);
    expect(q).toHaveLength(3);
  });

  it('critiques a teach-back with a valid feedback event', async () => {
    const fb = await new ActivitiesAgent(new FakeModel(() => FEEDBACK_ANSWER)).teachbackFeedback({ prefix: '', concept: 'PDAs', name: 'Ana', text: 'seeds' });
    expect(StreamEventData.teachback_feedback.safeParse({ teachbackId: 'x', ...fb }).success).toBe(true);
  });

  it('throws when the model fails, so the caller can answer 503 (no scripted duel)', async () => {
    class Down extends ModelPort {
      readonly name = 'down';
      // eslint-disable-next-line require-yield
      async *stream(): AsyncIterable<ModelEvent> { throw new Error('model down'); }
    }
    await expect(new ActivitiesAgent(new Down()).writeDuel({ prefix: '', plan: null, segment: 0, summaries: [], count: 3 })).rejects.toThrow(/model down/);
  });
});
