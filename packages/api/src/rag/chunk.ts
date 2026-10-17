// packages/api/src/rag/chunk.ts
// Pure: page texts -> retrieval chunks (~targetTokens each, overlapping) that keep their page.
// Sized for multilingual-e5-small, which embeds at most 512 tokens: anything past that is cut.
export interface ChunkDraft { idx: number; page: number | null; heading: string; content: string; tokenCount: number }

/** e5's tokenizer, measured: ~4.4 characters per token for English, ~3.1 for Georgian. ASCII
 *  counts 1/4 token per character, everything else 1/3, which stays on the safe side. */
export function estimateTokens(s: string): number {
  let ascii = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 128) ascii++;
  return Math.ceil(ascii / 4 + (s.length - ascii) / 3);
}

/** Pieces no larger than `max` tokens: sentences, long ones split at spaces, long words cut. */
function pieces(text: string, max: number): string[] {
  const out: string[] = [];
  for (const sentence of text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]) {
    if (estimateTokens(sentence) <= max) { out.push(sentence); continue; }
    let cur = '';
    for (const word of sentence.split(/(?<=\s)/)) {
      if (estimateTokens(word) > max) {
        if (cur) { out.push(cur); cur = ''; }
        const step = Math.max(1, max * 3); // characters: 3 per token is the denser script
        for (let i = 0; i < word.length; i += step) out.push(word.slice(i, i + step));
        continue;
      }
      if (cur && estimateTokens(cur + word) > max) { out.push(cur); cur = ''; }
      cur += word;
    }
    if (cur) out.push(cur);
  }
  return out;
}

export function chunkPages(pages: { page: number | null; text: string; heading?: string }[], { targetTokens = 450, overlap = 0.15 } = {}): ChunkDraft[] {
  const out: ChunkDraft[] = [];
  const budget = targetTokens * overlap;
  for (const p of pages) {
    const text = p.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    let current: string[] = [];
    let size = 0;
    const flush = () => {
      const content = current.join('').trim();
      if (content) out.push({ idx: out.length, page: p.page, heading: p.heading ?? '', content, tokenCount: estimateTokens(content) });
    };
    for (const s of pieces(text, targetTokens)) {
      const t = estimateTokens(s);
      if (current.length && size + t > targetTokens) {
        flush();
        // carry the last ~overlap of the chunk into the next one, only pieces that fit in it
        const keep: string[] = [];
        let kept = 0;
        for (let i = current.length - 1; i >= 0; i--) {
          const k = estimateTokens(current[i]);
          if (kept + k > budget) break;
          keep.unshift(current[i]);
          kept += k;
        }
        current = keep;
        size = kept;
      }
      current.push(s);
      size += t;
    }
    flush();
  }
  return out;
}
