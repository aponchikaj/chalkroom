// packages/api/src/rag/chunk.ts
// Pure: page texts -> retrieval chunks (~targetTokens each, overlapping) that keep their page.
export interface ChunkDraft { idx: number; page: number | null; heading: string; content: string; tokenCount: number }

export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

export function chunkPages(pages: { page: number | null; text: string; heading?: string }[], { targetTokens = 500, overlap = 0.15 } = {}): ChunkDraft[] {
  const out: ChunkDraft[] = [];
  for (const p of pages) {
    const text = p.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
    let current: string[] = [];
    const flush = () => {
      const content = current.join('').trim();
      if (content) out.push({ idx: out.length, page: p.page, heading: p.heading ?? '', content, tokenCount: estimateTokens(content) });
    };
    for (const s of sentences) {
      if (current.length && estimateTokens(current.join('') + s) > targetTokens) {
        flush();
        // carry the last ~overlap of the chunk into the next one
        const keep: string[] = [];
        let size = 0;
        for (let i = current.length - 1; i >= 0 && size < targetTokens * overlap; i--) { keep.unshift(current[i]); size += estimateTokens(current[i]); }
        current = keep;
      }
      current.push(s);
    }
    flush();
  }
  return out;
}
