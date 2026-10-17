// Scripted model: answers every request with the agent's canned tool input.
import { config } from '../config';
import { ModelPort, type ModelEvent, type ModelRequest } from './model.port';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockModel extends ModelPort {
  readonly name = 'mock';
  async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
    await sleep(config.mockDelayMs);
    yield { type: 'tool', name: req.tool.name, input: req.mock() };
    yield { type: 'done', stopReason: 'tool_use' };
  }
}
