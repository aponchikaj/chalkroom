// Pure scoring for the agent evals (packages/api/eval/run.ts). Unit-tested in test/eval-metrics.test.ts.
import { applySteps, emptyBoard } from '@chalk/board';
import type { BoardStep, TeachSegment } from '@chalk/schema';

const SAY_MAX_WORDS = 35;

export interface TeachScore {
  steps: number;
  pages: number;
  maxShapesPerPage: number;
  says: number;
  longSays: number;
  reducerErrors: number;
  /** arrows, highlights, moves... pointing at shapes never drawn */
  danglingRefs: number;
  hasCheck: boolean;
  checkComplete: boolean;
}

const isShape = (s: BoardStep) => 'add' in s || 'write' in s || 'mermaid' in s;
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : []);

/** References to ids no earlier step created. */
function dangling(steps: BoardStep[]): number {
  const known = new Set<string>();
  let bad = 0;
  for (const s of steps as Record<string, any>[]) {
    for (const k of ['add', 'write', 'mermaid']) if (s[k]?.id) known.add(s[k].id);
    const refs = [
      ...ids(s.add?.kind === 'arrow' ? [s.add.from, s.add.to] : []),
      ...ids(s.highlight), ...ids(s.underline), ...ids(s.circle), ...ids(s.pulse), ...ids(s.fade), ...ids(s.remove),
      ...ids(s.update?.id), ...ids(s.move?.id), ...ids(s.add?.kind === 'group' ? s.add.children : []),
    ];
    bad += refs.filter((r) => !known.has(r)).length;
  }
  return bad;
}

export function scoreTeach(seg: TeachSegment): TeachScore {
  let pages = 1, onPage = 0, maxShapes = 0, says = 0, longSays = 0;
  for (const s of seg.steps) {
    if ('page' in s || ('clear' in s && (s as { clear?: boolean }).clear)) { pages += 'page' in s ? 1 : 0; onPage = 0; continue; }
    if (isShape(s)) { onPage++; maxShapes = Math.max(maxShapes, onPage); }
    if ('say' in s) { says++; if ((s as { say: string }).say.split(/\s+/).length > SAY_MAX_WORDS) longSays++; }
  }
  // a leading page step opens the first page rather than a second one
  if ('page' in (seg.steps[0] ?? {})) pages--;
  const { errors } = applySteps(emptyBoard(), seg.steps);
  const check = seg.check as { answer?: unknown; explanation?: string; prompt?: string } | undefined;
  return {
    steps: seg.steps.length, pages, maxShapesPerPage: maxShapes, says, longSays, reducerErrors: errors.length, danglingRefs: dangling(seg.steps),
    hasCheck: !!check, checkComplete: !!check && check.answer !== undefined && !!check.explanation && !!check.prompt,
  };
}

/** Share of question pairs grouped the same way as the labels (together or apart). */
export function pairwiseAgreement(gold: Record<string, string>, pred: Record<string, string | null>): number {
  const ids = Object.keys(gold);
  let agree = 0, pairs = 0;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    pairs++;
    const g = gold[ids[i]] === gold[ids[j]];
    const p = pred[ids[i]] !== null && pred[ids[i]] === pred[ids[j]];
    if (g === p) agree++;
  }
  return pairs ? agree / pairs : 1;
}

export const hitAtK = (ranked: string[], relevant: string[], k: number) => (ranked.slice(0, k).some((id) => relevant.includes(id)) ? 1 : 0);

export function reciprocalRank(ranked: string[], relevant: string[]): number {
  const i = ranked.findIndex((id) => relevant.includes(id));
  return i < 0 ? 0 : 1 / (i + 1);
}
