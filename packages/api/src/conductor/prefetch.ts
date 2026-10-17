// packages/api/src/conductor/prefetch.ts
// Pipelining (design doc: Pacing): the next segment is written while the class sits at the
// gate, then replayed, still streaming if unfinished. One consumer per buffer.
export class ChunkBuffer<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private done = false;
  private error: unknown = null;
  private wake: (() => void) | null = null;

  push(x: T) { this.items.push(x); this.wake?.(); }
  close(error: unknown = null) { this.done = true; this.error = error; this.wake?.(); }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let i = 0;
    for (;;) {
      if (i < this.items.length) { yield this.items[i++]; continue; }
      if (this.done) { if (this.error) throw this.error; return; }
      await new Promise<void>((r) => { this.wake = r; });
      this.wake = null;
    }
  }
}

export function prefetch<T>(source: AsyncIterable<T>): ChunkBuffer<T> {
  const buf = new ChunkBuffer<T>();
  void (async () => {
    try { for await (const x of source) buf.push(x); buf.close(); } catch (e) { buf.close(e); }
  })();
  return buf;
}
