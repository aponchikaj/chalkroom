// packages/api/test/chunk.test.ts
import { describe, it, expect } from 'vitest';
import { chunkPages, estimateTokens } from '../src/rag/chunk';

const para = (n: number) => Array.from({ length: n }, (_, i) => `Sentence ${i} about program derived addresses and seeds.`).join(' ');

describe('chunkPages', () => {
  it('keeps short pages as one chunk each with their page number', () => {
    const c = chunkPages([{ page: 1, text: 'Short page one.' }, { page: 2, text: 'Short page two.' }]);
    expect(c.map((x) => [x.idx, x.page, x.content])).toEqual([[0, 1, 'Short page one.'], [1, 2, 'Short page two.']]);
  });
  it('splits long pages near the target size with overlap', () => {
    const c = chunkPages([{ page: 3, text: para(300) }], { targetTokens: 200, overlap: 0.15 });
    expect(c.length).toBeGreaterThan(3);
    for (const x of c) { expect(x.page).toBe(3); expect(x.tokenCount).toBeLessThanOrEqual(240); }
    const tail = c[0].content.split(' ').slice(-4).join(' ');
    expect(c[1].content).toContain(tail); // overlap carries context across the cut
  });
  it('drops empty pages', () => {
    expect(chunkPages([{ page: 1, text: '   \n ' }])).toEqual([]);
  });
  it('estimates about 4 characters per token', () => {
    expect(estimateTokens('x'.repeat(400))).toBe(100);
  });
});
