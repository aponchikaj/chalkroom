// packages/api/src/triage/triage-plan.ts
// Pure: turns one triage tool call into the rows to write. No DB, no config, so it is unit-tested.
// Rule: every question leaves `pending` (UX rule 2), whatever the agent returned.
import type { ClusterRoute, QuestionStatus, TriageResult } from '@chalk/schema';

export interface TriageQuestion { id: string; text: string; authorId: string }
export interface TriageCluster { id: string; title: string; route: ClusterRoute | null; askerIds: string[] }

export interface ClusterWrite {
  /** existing cluster id, or `new:<normalized title>` for a cluster to insert */
  key: string;
  isNew: boolean;
  title: string;
  route: ClusterRoute;
  reason: string | null;
  targetSegment: number | null;
  answer: string | null;
  askerIds: string[];
}
export interface QuestionWrite { questionId: string; clusterKey: string | null; status: QuestionStatus }
export interface ThreadOffer { ownerId: string; topic: string; questionId: string }
export interface TriagePlan { clusters: ClusterWrite[]; questions: QuestionWrite[]; offers: ThreadOffer[] }

export const FALLBACK_ANSWER = 'The tutor will answer this in the next Q&A.';
export const EMPTY_TRIAGE: TriageResult = { assign: [], route: [], flag: [] };

const STATUS: Record<ClusterRoute, QuestionStatus> = { class: 'grouped', later: 'later', inline: 'answered', thread: 'thread' };
const newKey = (title: string) => `new:${title.trim().toLowerCase()}`;

type Draft = ClusterWrite & { routed: boolean; questionIds: string[] };

export function planTriage(result: TriageResult, questions: TriageQuestion[], clusters: TriageCluster[]): TriagePlan {
  const existing = new Map(clusters.map((c) => [c.id, c]));
  const drafts = new Map<string, Draft>();
  const flagged = new Set(result.flag.map((f) => f.questionId));
  const byId = new Map(questions.map((x) => [x.id, x]));
  const assigned = new Map<string, string>(); // question id -> cluster key

  const fromExisting = (c: TriageCluster): Draft => ({
    key: c.id, isNew: false, title: c.title, route: c.route ?? 'inline', reason: null, targetSegment: null,
    answer: null, askerIds: [...c.askerIds], routed: c.route !== null, questionIds: [],
  });
  const fresh = (title: string): Draft => ({
    key: newKey(title), isNew: true, title: title.trim(), route: 'inline', reason: null, targetSegment: null,
    answer: null, askerIds: [], routed: false, questionIds: [],
  });
  const draftFor = (key: string, make: () => Draft) => {
    let d = drafts.get(key);
    if (!d) { d = make(); drafts.set(key, d); }
    return d;
  };
  const join = (d: Draft, question: TriageQuestion) => {
    if (!d.askerIds.includes(question.authorId)) d.askerIds.push(question.authorId);
    d.questionIds.push(question.id);
    assigned.set(question.id, d.key);
  };

  for (const a of result.assign) {
    const question = byId.get(a.questionId);
    if (!question || flagged.has(question.id) || assigned.has(question.id)) continue;
    const hit = a.cluster !== 'new' ? existing.get(a.cluster) : undefined;
    const d = hit ? draftFor(hit.id, () => fromExisting(hit)) : draftFor(newKey(a.title ?? question.text), () => fresh(a.title ?? question.text));
    join(d, question);
  }
  // the model forgot a question: it becomes its own cluster
  for (const question of questions) {
    if (flagged.has(question.id) || assigned.has(question.id)) continue;
    join(draftFor(newKey(question.text), () => fresh(question.text)), question);
  }

  const offers: ThreadOffer[] = [];
  for (const r of result.route) {
    const hit = existing.get(r.cluster);
    const d = drafts.get(r.cluster) ?? drafts.get(newKey(r.cluster)) ?? (hit ? draftFor(hit.id, () => fromExisting(hit)) : undefined);
    if (!d) continue;
    d.route = r.to;
    d.routed = true;
    d.reason = r.reason ?? null;
    d.targetSegment = r.to === 'later' ? r.segment ?? null : null;
    d.answer = r.to === 'inline' ? r.answer ?? null : d.answer;
    if (r.to === 'thread' && d.questionIds.length) {
      const owner = r.user && d.askerIds.includes(r.user) ? r.user : d.askerIds[0];
      if (owner && !offers.some((o) => o.ownerId === owner)) offers.push({ ownerId: owner, topic: d.title, questionId: d.questionIds[0] });
    }
  }

  for (const d of drafts.values()) {
    if (!d.routed) { d.route = 'inline'; d.reason = d.reason ?? 'no route from triage'; }
    if (d.route === 'inline' && !d.answer) d.answer = FALLBACK_ANSWER;
  }

  const questionWrites: QuestionWrite[] = questions.map((question) => {
    if (flagged.has(question.id)) return { questionId: question.id, clusterKey: null, status: 'flagged' };
    const key = assigned.get(question.id)!;
    return { questionId: question.id, clusterKey: key, status: STATUS[drafts.get(key)!.route] };
  });

  return {
    clusters: [...drafts.values()].map(({ routed: _r, questionIds: _q, ...c }) => c),
    questions: questionWrites,
    offers,
  };
}
