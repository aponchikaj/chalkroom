// packages/api/test/teach-stream.test.ts
import { describe, it, expect } from 'vitest';
import { SAMPLE_SEGMENTS } from './fixtures';
import { ModelPort, type ModelEvent, type ModelRequest } from '../src/agents/model.port';
import { InvalidTeach, bySay, streamTeach } from '../src/agents/teach-stream';

class FakeModel extends ModelPort {
  readonly name = 'fake';
  finalSent = false;
  constructor(private events: ModelEvent[]) { super(); }
  async *stream(): AsyncIterable<ModelEvent> {
    for (const e of this.events) { if (e.type === 'tool') this.finalSent = true; yield e; }
  }
}
const req = { agent: 'lead', prefix: '', system: '', messages: [], tool: { name: 'teach_segment', description: '', input_schema: {} } } as ModelRequest;
const seg = SAMPLE_SEGMENTS[0];
const deltas = (json: string, n: number): ModelEvent[] => Array.from({ length: Math.ceil(json.length / n) }, (_, i) => ({ type: 'tool_delta', partialJson: json.slice(i * n, i * n + n) }));

describe('streamTeach', () => {
  it('yields steps before the final tool input and loses nothing', async () => {
    const model = new FakeModel([...deltas(JSON.stringify(seg), 7), { type: 'tool', name: 'teach_segment', input: seg }, { type: 'done', stopReason: 'tool_use' }]);
    const chunks = [];
    let firstBeforeFinal: boolean | null = null;
    for await (const c of streamTeach(model, req)) { if (firstBeforeFinal === null) firstBeforeFinal = !model.finalSent; chunks.push(c); }
    expect(firstBeforeFinal).toBe(true);
    expect(chunks.flatMap((c) => ('steps' in c ? c.steps : []))).toEqual(seg.steps);
    expect(chunks.at(-1)).toEqual({ check: seg.check });
  });
  it('takes the final-input path for a model that sends no deltas', async () => {
    const model = new FakeModel([{ type: 'tool', name: 'teach_segment', input: seg }, { type: 'done', stopReason: 'tool_use' }]);
    const chunks = [];
    for await (const c of streamTeach(model, req)) chunks.push(c);
    expect(chunks.filter((c) => 'steps' in c).map((c) => ('steps' in c ? c.steps : []))).toEqual(bySay(seg.steps));
  });
  it('throws InvalidTeach when nothing valid arrived, so the caller can repair', async () => {
    const model = new FakeModel([{ type: 'tool', name: 'teach_segment', input: { title: 'x' } }]);
    await expect((async () => { for await (const _ of streamTeach(model, req)) { /* drain */ } })()).rejects.toBeInstanceOf(InvalidTeach);
  });
});

describe('streamTeach cleans double-escaped text', () => {
  it('turns literal \\n in streamed board text into line breaks', async () => {
    const { streamTeach } = await import('../src/agents/teach-stream');
    const { ModelPort } = await import('../src/agents/model.port');
    const json = JSON.stringify({ title: 't', steps: [{ add: { id: 'a', kind: 'box', text: 'Inputs:\\nSeeds' } }, { say: 'Look.' }] });
    class One extends ModelPort {
      readonly name = 'x';
      async *stream() { yield { type: 'tool_delta' as const, partialJson: json }; yield { type: 'tool' as const, name: 'teach_segment', input: JSON.parse(json) }; yield { type: 'done' as const, stopReason: 'stop' }; }
    }
    const req = { agent: 'lead', prefix: '', system: '', messages: [], tool: { name: 'teach_segment', description: '', input_schema: {} } } as never;
    const chunks = [];
    for await (const c of streamTeach(new One(), req)) chunks.push(c);
    const first = (chunks[0] as { steps: { add?: { text: string } }[] }).steps[0];
    expect(first.add?.text).toBe('Inputs:\nSeeds');
  });
});
