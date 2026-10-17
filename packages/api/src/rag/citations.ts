// packages/api/src/rag/citations.ts
// Pure: the tutor may only cite sources (and pages) that exist; anything else loses its `source`.
import type { BoardStep } from '@chalk/schema';

const RE = /^res:([0-9a-zA-Z-]+)(?:#p(\d+))?$/;

/** A citation is kept when its source exists and its page (if any) is 1..page count; a source
 *  without pages takes no page. Checked on every step that can carry a source. */
export function citationOk(source: string, known: Map<string, number | null>): boolean {
  const m = RE.exec(source);
  if (!m) return false;
  const pages = known.get(m[1]);
  if (pages === undefined) return false;
  if (!m[2]) return true;
  const n = Number(m[2]);
  return pages !== null && n >= 1 && n <= pages;
}

export function keepKnownCitations(steps: BoardStep[], known: Map<string, number | null>): BoardStep[] {
  return steps.map((s) => {
    for (const key of ['add', 'write', 'update', 'mermaid'] as const) {
      const shape = (s as Record<string, { source?: unknown } | undefined>)[key];
      if (!shape || typeof shape !== 'object' || shape.source === undefined) continue;
      if (typeof shape.source === 'string' && citationOk(shape.source, known)) continue;
      const { source: _drop, ...rest } = shape;
      return { ...s, [key]: rest } as BoardStep;
    }
    return s;
  });
}
