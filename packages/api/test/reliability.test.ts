import { describe, it, expect } from 'vitest';
import { ModelPort, type ModelEvent, type ModelRequest } from '../src/agents/model.port';
import { MeteredModel, UsageMeter } from '../src/agents/metered.model';
import { spammers } from '../src/triage/triage-plan';

class Scripted extends ModelPort {
  constructor(readonly name: string, private input: unknown, private tokens = 0) { super(); }
  async *stream(): AsyncIterable<ModelEvent> {
    yield { type: 'tool', name: 'x', input: this.input };
    yield { type: 'done', stopReason: 'tool_use', usage: this.tokens ? { input: this.tokens, output: 0, cacheRead: 0, cacheWrite: 0 } : undefined };
  }
}
const req = (roomId: string) => ({ agent: 'lead', roomId, prefix: '', system: '', messages: [], tool: { name: 'x', description: '', input_schema: {} }, mock: () => null }) as ModelRequest;

describe('room token budget', () => {
  it('answers from the fallback once a room is over budget, and notifies once', async () => {
    const meter = new UsageMeter();
    const over: string[] = [];
    meter.onBudgetExceeded((id) => over.push(id));
    const model = new MeteredModel(new Scripted('real', 'real', 600), meter, () => undefined, { tokens: 1000, fallback: new Scripted('mock', 'mock') });
    expect(await model.call(req('r1'))).toBe('real'); // 600
    expect(await model.call(req('r1'))).toBe('real'); // 1200: now over
    expect(await model.call(req('r1'))).toBe('mock');
    expect(await model.call(req('r1'))).toBe('mock');
    expect(await model.call(req('r2'))).toBe('real'); // per room
    expect(over).toEqual(['r1']);
  });
});

describe('spammers', () => {
  it('lists authors with 3 or more flagged questions', () => {
    expect(spammers(['a', 'b', 'a', 'a', 'b', 'c'], 3)).toEqual(['a']);
    expect(spammers([], 3)).toEqual([]);
  });
});

describe('FallbackModel', () => {
  class Breaks extends ModelPort {
    readonly name = 'groq';
    async *stream(): AsyncIterable<ModelEvent> {
      yield { type: 'tool_delta', partialJson: '{"segm' };
      throw new Error('groq hit max_tokens');
    }
  }
  it('answers from the fallback when a non-streamed call breaks after partial output', async () => {
    const { FallbackModel } = await import('../src/agents/fallback.model');
    const m = new FallbackModel(new Breaks(), new Scripted('mock', { plan: 'mock' }), () => undefined);
    expect(await m.call(req('r'))).toEqual({ plan: 'mock' });
  });
  it('still throws for a live stream, where learners already saw the partial steps', async () => {
    const { FallbackModel } = await import('../src/agents/fallback.model');
    const m = new FallbackModel(new Breaks(), new Scripted('mock', { plan: 'mock' }), () => undefined);
    await expect(m.call({ ...req('r'), streamed: true })).rejects.toThrow(/max_tokens/);
  });
});
