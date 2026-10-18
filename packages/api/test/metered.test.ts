import { describe, it, expect } from 'vitest';
import { ModelPort, type ModelEvent, type ModelRequest } from '../src/agents/model.port';
import { MeteredModel, UsageMeter } from '../src/agents/metered.model';

class Scripted extends ModelPort {
  readonly name = 'scripted';
  constructor(private events: ModelEvent[]) { super(); }
  async *stream(): AsyncIterable<ModelEvent> { for (const e of this.events) yield e; }
}
const req = (roomId?: string) => ({ agent: 'lead', roomId, prefix: '', system: '', messages: [], tool: { name: 'teach_segment', description: '', input_schema: {} } }) as ModelRequest;
const done = (input: number, output: number, cacheRead = 0, cacheWrite = 0): ModelEvent => ({ type: 'done', stopReason: 'tool_use', usage: { input, output, cacheRead, cacheWrite } });

describe('MeteredModel', () => {
  it('passes events through and adds usage to the room', async () => {
    const meter = new UsageMeter();
    const lines: string[] = [];
    const model = new MeteredModel(new Scripted([{ type: 'tool', name: 'teach_segment', input: { ok: 1 } }, done(1000, 200, 50, 10)]), meter, (l) => lines.push(l));
    expect(await model.call(req('room-1'))).toEqual({ ok: 1 });
    await model.call(req('room-1'));
    expect(meter.total('room-1')).toBe(2 * (1000 + 200 + 50 + 10));
    expect(meter.total('room-2')).toBe(0);
    expect(lines[0]).toMatch(/^lead teach_segment room=room-1 in=1000 out=200 cacheRead=50 cacheWrite=10 \d+ms$/);
  });

  it('logs calls without a room but does not meter them', async () => {
    const meter = new UsageMeter();
    const lines: string[] = [];
    await new MeteredModel(new Scripted([{ type: 'tool', name: 'x', input: 1 }, done(5, 5)]), meter, (l) => lines.push(l)).call(req());
    expect(lines[0]).toContain('room=-');
  });
});
