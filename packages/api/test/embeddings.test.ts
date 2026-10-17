import { describe, it, expect } from 'vitest';
import { LocalEmbeddings, type Extractor } from '../src/rag/embeddings/local.embeddings';
import { EMBEDDING_DIMS } from '../src/rag/embeddings/embedding.port';

/** Fake e5 extractor: records what it was given, returns one fixed-size vector per input. */
function fakeExtractor() {
  const seen: string[][] = [];
  const fn: Extractor = async (texts) => {
    seen.push(texts);
    return { tolist: () => texts.map((_, i) => Array.from({ length: EMBEDDING_DIMS }, () => i + 1)) };
  };
  return { fn, seen };
}

describe('LocalEmbeddings', () => {
  it('uses the 384-dimension column size', () => {
    expect(EMBEDDING_DIMS).toBe(384);
  });

  it('adds the e5 query and passage prefixes', async () => {
    const f = fakeExtractor();
    const e = new LocalEmbeddings(async () => f.fn);
    await e.embed(['why no key?'], 'query');
    await e.embed(['A PDA has no key.'], 'document');
    expect(f.seen).toEqual([['query: why no key?'], ['passage: A PDA has no key.']]);
  });

  it('batches long inputs and keeps the order', async () => {
    const f = fakeExtractor();
    const e = new LocalEmbeddings(async () => f.fn, 32);
    const out = await e.embed(Array.from({ length: 70 }, (_, i) => `t${i}`), 'document');
    expect(f.seen.map((b) => b.length)).toEqual([32, 32, 6]);
    expect(out).toHaveLength(70);
    expect(out[33]?.[0]).toBe(2);
    expect(out.every((v) => v?.length === EMBEDDING_DIMS)).toBe(true);
  });

  it('loads the model once, even when calls overlap', async () => {
    let loads = 0;
    const f = fakeExtractor();
    const e = new LocalEmbeddings(async () => { loads++; return f.fn; });
    await Promise.all([e.embed(['a'], 'query'), e.embed(['b'], 'query'), e.warm()]);
    expect(loads).toBe(1);
  });

  it('returns nothing for no input without loading', async () => {
    let loads = 0;
    const e = new LocalEmbeddings(async () => { loads++; return fakeExtractor().fn; });
    expect(await e.embed([], 'query')).toEqual([]);
    expect(loads).toBe(0);
  });
});
