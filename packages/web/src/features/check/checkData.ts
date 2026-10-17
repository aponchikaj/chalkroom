// A4 (Dev A): check helpers. Builds the answer spread rows from a closed check, and remembers
// the answer this device sent so the spread can mark "you" (local only; the server keeps no echo).
import type { PublicQuestion } from '@chalk/schema';
import type { ClosedCheck } from '../../room/store';

/** Question types a person reads (no auto-grading, so no spread). */
export const FREE_TEXT = new Set(['short', 'explain', 'code', 'diagram']);

const KEY = 'chalk:my-check-answers';
let cache: Record<string, unknown> | null = null;
const load = () => {
  if (cache) return cache;
  try { cache = JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Record<string, unknown>; } catch { cache = {}; }
  return cache;
};

export function rememberAnswer(checkId: string, value: unknown) {
  const all = { ...load(), [checkId]: value };
  cache = all;
  try { sessionStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode: memory only */ }
}

export function myAnswer(checkId: string): unknown {
  return load()[checkId];
}

export interface SpreadRow { key: string; label: string; count: number; correct: boolean; mine: boolean }

const parse = (k: string): unknown => { try { return JSON.parse(k); } catch { return k; } };
/** tf answers arrive as true, {"value":true} or "true"; reduce to the boolean */
const tfValue = (v: unknown): boolean | undefined => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === 'true' ? true : v === 'false' ? false : undefined;
  if (v && typeof v === 'object' && 'value' in v) return tfValue((v as { value: unknown }).value);
  return undefined;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b) || String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/** One row per possible answer (mcq, tf) or per distinct answer given (other auto-graded types). */
export function spreadRows(q: PublicQuestion, closed: ClosedCheck, mine: unknown): SpreadRow[] {
  const counts = closed.spread.counts;
  if (q.type === 'mcq' && q.options) {
    return q.options.map((label, i) => ({
      key: String(i), label, count: counts[String(i)] ?? 0, correct: closed.answer === i, mine: mine === i,
    }));
  }
  if (q.type === 'tf') {
    const truth = tfValue(closed.answer);
    const me = tfValue(mine);
    return [true, false].map((b) => ({
      key: String(b), label: b ? 'True' : 'False',
      count: Object.entries(counts).reduce((n, [k, c]) => n + (tfValue(parse(k)) === b ? c : 0), 0),
      correct: truth === b, mine: me === b,
    }));
  }
  const opts = q.options ?? [];
  const label = (v: unknown) => {
    if (Array.isArray(v) && v.every((x) => typeof x === 'number')) return v.map((i) => opts[i] ?? String(i)).join(q.type === 'order' ? ' then ' : ', ');
    return typeof v === 'string' ? v : JSON.stringify(v);
  };
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, count]) => {
      const v = parse(k);
      return { key: k, label: label(v), count, correct: same(v, closed.answer), mine: mine !== undefined && same(v, mine) };
    });
}
