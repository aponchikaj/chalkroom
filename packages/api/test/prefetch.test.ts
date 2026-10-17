// packages/api/test/prefetch.test.ts
import { describe, it, expect } from 'vitest';
import { prefetch } from '../src/conductor/prefetch';

async function* slow(items: number[], fail = false) {
  for (const i of items) { await new Promise((r) => setTimeout(r, 5)); yield i; }
  if (fail) throw new Error('boom');
}

describe('prefetch', () => {
  it('buffers ahead and replays everything in order, even mid-stream', async () => {
    const buf = prefetch(slow([1, 2, 3]));
    await new Promise((r) => setTimeout(r, 8)); // consumer arrives late
    const got: number[] = [];
    for await (const x of buf) got.push(x);
    expect(got).toEqual([1, 2, 3]);
  });
  it('rethrows the source error after the buffered items', async () => {
    const got: number[] = [];
    await expect((async () => { for await (const x of prefetch(slow([1], true))) got.push(x); })()).rejects.toThrow('boom');
    expect(got).toEqual([1]);
  });
});
