// packages/api/src/triage/faq-match.ts
// FAQ reuse (design doc, Community features: "Future triage checks the FAQ first"). Pure and free:
// normalized word overlap of content words, so no model call is spent on a
// question the course has already answered. Unit-tested in test/courses-faq.test.ts.
import type { FaqRow } from '@chalk/schema';
import type { TriageQuestion } from './triage-plan';
import { FALLBACK_ANSWER } from './triage-plan';

/** Cluster reason that marks an answer reused from the course FAQ. */
export const FAQ_REASON = 'Answered from the course FAQ';

/** Overlap needed to reuse an answer: stricter than clustering (0.5), a wrong reuse is worse. */
export const FAQ_THRESHOLD = 0.6;

type Faq = Pick<FaqRow, 'id' | 'topic_id' | 'question' | 'answer' | 'askers_total'>;

const STOP = new Set(("a an the is are was were be why how what when where which who whom can could does did do of to in on at for it its this that these those i you we they me my our your not cant can't don't doesnt doesn't with by and or so if about there here than then just get got there's what's").split(' '));

export function faqWords(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .filter((w) => w.length > 2 && !STOP.has(w)));
}

/** Shared words over the smaller set; 0 when either side has no content words. Needs 2+ shared words unless one side has only one. */
export function overlap(a: string, b: string): number {
  const x = faqWords(a), y = faqWords(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  if (both < Math.min(2, x.size, y.size)) return 0;
  return both / Math.min(x.size, y.size);
}

const norm = (s: string) => [...faqWords(s)].sort().join(' ') || s.trim().toLowerCase();

/** The conductor saves every answered cluster after class, so repeats pile up: merge them (oldest answer wins, counts add up). */
export function mergeFaq<T extends Faq & { created_at?: string }>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  const sorted = [...rows].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  for (const r of sorted) {
    if (!r.answer?.trim() || r.answer.trim() === FALLBACK_ANSWER) continue;
    const k = norm(r.question);
    const hit = byKey.get(k);
    if (hit) byKey.set(k, { ...hit, askers_total: hit.askers_total + r.askers_total });
    else byKey.set(k, { ...r });
  }
  return [...byKey.values()].sort((a, b) => b.askers_total - a.askers_total);
}

export interface FaqHit { questionId: string; faq: Faq; score: number }

/**
 * Best FAQ entry for each question above the threshold. Entries of the room's topic win ties.
 * Returns the matched questions and the ones left for the triage model.
 */
export function matchFaq(questions: TriageQuestion[], faq: Faq[], topicId: string | null = null, threshold = FAQ_THRESHOLD): { hits: FaqHit[]; rest: TriageQuestion[] } {
  const usable = mergeFaq(faq);
  const hits: FaqHit[] = [];
  const rest: TriageQuestion[] = [];
  for (const q of questions) {
    let best: FaqHit | null = null;
    for (const f of usable) {
      const score = overlap(q.text, f.question) + (topicId && f.topic_id === topicId ? 0.01 : 0);
      if (score >= threshold && (!best || score > best.score)) best = { questionId: q.id, faq: f, score };
    }
    if (best) hits.push(best);
    else rest.push(q);
  }
  return { hits, rest };
}
