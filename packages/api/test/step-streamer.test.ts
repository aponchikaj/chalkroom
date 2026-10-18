// packages/api/test/step-streamer.test.ts
import { describe, it, expect } from 'vitest';
import { SAMPLE_SEGMENTS } from './fixtures';
import { StepStreamer } from '../src/agents/step-streamer';

const feed = (json: string, size: number) => {
  const s = new StepStreamer();
  const out: unknown[] = [];
  for (let i = 0; i < json.length; i += size) out.push(...s.push(json.slice(i, i + size)));
  return out;
};

describe('StepStreamer', () => {
  it('emits every element of steps, whatever the chunk size', () => {
    const seg = SAMPLE_SEGMENTS[1]; // has code with quotes, brackets and newlines
    for (const size of [1, 3, 17, 4096]) expect(feed(JSON.stringify(seg), size)).toEqual(seg.steps);
  });
  it('ignores arrays outside steps and tricky strings', () => {
    const json = '{"title":"a [b] {c} \\"steps\\"","x":[{"no":1}],"steps":[{"say":"} ] \\" {"},{"wait":1}],"check":{"options":[{"z":1}]}}';
    expect(feed(json, 2)).toEqual([{ say: '} ] " {' }, { wait: 1 }]);
  });
});
