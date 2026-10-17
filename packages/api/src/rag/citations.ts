// packages/api/src/rag/citations.ts
// Pure: the tutor may only cite sources (and pages) that exist; anything else loses its `source`.
import type { BoardStep } from '@chalk/schema';

const RE = /^res:([0-9a-zA-Z-]+)(?:#p(\d+))?$/;

export function keepKnownCitations(steps: BoardStep[], known: Map<string, number | null>): BoardStep[] {
  return steps.map((s) => {
    const add = (s as { add?: { source?: string } }).add;
    if (!add?.source) return s;
    const m = RE.exec(add.source);
    const pages = m ? known.get(m[1]) : undefined;
    const ok = m && pages !== undefined && (!m[2] || pages === null || Number(m[2]) <= pages);
    if (ok) return s;
    const { source: _drop, ...rest } = add;
    return { ...s, add: rest } as BoardStep;
  });
}
