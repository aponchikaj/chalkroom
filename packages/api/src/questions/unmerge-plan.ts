// Pure bookkeeping for POST /questions/:id/unmerge (lane Q). No DB, so it is unit-tested.
// Design doc, "Risks": triage can over-merge different questions; the asker (or the host) takes
// one back out with one click and it gets its own card, routed on its own.
import type { ClusterRoute, QuestionStatus } from '@chalk/schema';
import type { ClusterWrite } from '../triage/triage-plan';

export const UNMERGED_REASON = 'unmerged by the asker';

export interface UnmergeQuestion { id: string; author_id: string; cluster_id: string | null; status: QuestionStatus }

/** Why this unmerge is refused, as [http status, message], or null when it may go ahead. */
export function unmergeRefusal(q: UnmergeQuestion, actorId: string, hostId: string, siblings: number): [403 | 409, string] | null {
  if (q.author_id !== actorId && hostId !== actorId) return [403, 'only the asker or the host can take a question out of its group'];
  if (!q.cluster_id || q.status === 'pending' || q.status === 'flagged') return [409, 'this question is not in a group'];
  if (q.status === 'thread') return [409, 'this question already went to a thread'];
  if (siblings < 1) return [409, 'this question is not grouped with any other'];
  return null;
}

/**
 * What happens to the cluster the question leaves: recounted; retitled with the last question's
 * own words when only one is left (the old title may be the text of the question that left);
 * deleted when nothing is left (only reachable in a race of two unmerges).
 */
export type OldClusterWrite = { op: 'delete' } | { op: 'keep' } | { op: 'update'; asker_count: number; title?: string };

export function oldClusterAfter(remaining: { author_id: string; text: string }[], answered: boolean): OldClusterWrite {
  if (remaining.length === 1) return { op: 'update', asker_count: 1, title: remaining[0].text };
  if (remaining.length) return { op: 'update', asker_count: new Set(remaining.map((r) => r.author_id)).size };
  // an empty open cluster would only be a ghost card; an answered one is class history
  // (an answer_cluster event points at it), so it stays
  return answered ? { op: 'keep' } : { op: 'delete' };
}

export interface UnmergedRoute { route: ClusterRoute; reason: string; answer: string | null; target_segment: number | null; status: QuestionStatus }

const STATUS: Record<Exclude<ClusterRoute, 'thread'>, QuestionStatus> = { class: 'grouped', later: 'later', inline: 'answered' };

/**
 * The route for the question's new cluster, from a one-question triage plan (null when the
 * agent call failed). A thread offer is not made from an unmerge, and a failed call goes to
 * the class Q&A beat: it is the only path that answers a cluster later on its own.
 */
export function unmergedRoute(planned: ClusterWrite | null): UnmergedRoute {
  if (!planned || planned.route === 'thread') {
    return { route: 'class', reason: UNMERGED_REASON, answer: null, target_segment: null, status: 'grouped' };
  }
  return {
    route: planned.route,
    reason: planned.reason ? `${UNMERGED_REASON}; ${planned.reason}` : UNMERGED_REASON,
    answer: planned.route === 'inline' ? planned.answer : null,
    target_segment: planned.route === 'later' ? planned.targetSegment : null,
    status: STATUS[planned.route],
  };
}
