// packages/api/test/unmerge-plan.test.ts (lane Q)
import { describe, it, expect } from 'vitest';
import { oldClusterAfter, unmergeRefusal, unmergedRoute, UNMERGED_REASON } from '../src/questions/unmerge-plan';
import type { ClusterWrite } from '../src/triage/triage-plan';

const q = { id: 'q1', author_id: 'ana', cluster_id: 'c1', status: 'grouped' as const };
const planned = (p: Partial<ClusterWrite>): ClusterWrite => ({ key: 'new:x', isNew: true, title: 'x', route: 'inline', reason: null, targetSegment: null, answer: 'A short answer', askerIds: ['ana'], ...p });

describe('unmergeRefusal', () => {
  it('lets the asker and the host unmerge, nobody else', () => {
    expect(unmergeRefusal(q, 'ana', 'host', 1)).toBeNull();
    expect(unmergeRefusal(q, 'host', 'host', 1)).toBeNull();
    expect(unmergeRefusal(q, 'gio', 'host', 1)?.[0]).toBe(403);
  });
  it('refuses questions that are not in a group with others', () => {
    expect(unmergeRefusal({ ...q, cluster_id: null }, 'ana', 'host', 1)?.[0]).toBe(409);
    expect(unmergeRefusal({ ...q, status: 'pending' }, 'ana', 'host', 1)?.[0]).toBe(409);
    expect(unmergeRefusal({ ...q, status: 'flagged' }, 'ana', 'host', 1)?.[0]).toBe(409);
    expect(unmergeRefusal({ ...q, status: 'thread' }, 'ana', 'host', 1)?.[0]).toBe(409);
    expect(unmergeRefusal(q, 'ana', 'host', 0)?.[0]).toBe(409);
  });
});

describe('oldClusterAfter', () => {
  it('recounts distinct askers of what is left', () => {
    expect(oldClusterAfter([{ author_id: 'gio', text: 'a' }, { author_id: 'gio', text: 'b' }, { author_id: 'mari', text: 'c' }], false)).toEqual({ op: 'update', asker_count: 2 });
  });
  it('retitles a cluster left with one question with its own words', () => {
    expect(oldClusterAfter([{ author_id: 'gio', text: 'why cant a PDA sign for itself' }], false))
      .toEqual({ op: 'update', asker_count: 1, title: 'why cant a PDA sign for itself' });
  });
  it('deletes an empty open cluster and keeps an answered one', () => {
    expect(oldClusterAfter([], false)).toEqual({ op: 'delete' });
    expect(oldClusterAfter([], true)).toEqual({ op: 'keep' });
  });
});

describe('unmergedRoute', () => {
  it('keeps an inline answer from the one-question triage', () => {
    expect(unmergedRoute(planned({}))).toEqual({ route: 'inline', reason: UNMERGED_REASON, answer: 'A short answer', target_segment: null, status: 'answered' });
  });
  it('keeps a later route with its segment', () => {
    const r = unmergedRoute(planned({ route: 'later', targetSegment: 3, reason: 'segment 4 covers it' }));
    expect(r).toMatchObject({ route: 'later', target_segment: 3, answer: null, status: 'later' });
    expect(r.reason).toContain(UNMERGED_REASON);
  });
  it('sends a failed call or a thread route to the class Q&A', () => {
    for (const p of [null, planned({ route: 'thread' })]) {
      expect(unmergedRoute(p)).toEqual({ route: 'class', reason: UNMERGED_REASON, answer: null, target_segment: null, status: 'grouped' });
    }
  });
});
