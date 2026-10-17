// packages/api/test/library.test.ts
import { describe, it, expect } from 'vitest';
import { buildChapters, countKudos, minutesBetween, nextTopicId } from '../src/library/library.logic';

describe('buildChapters', () => {
  it('lists segment starts and class answers in seq order, nothing else', () => {
    const steps = [{ say: 'hi' }];
    const ch = buildChapters([
      { seq: 9, kind: 'answer_cluster', data: { clusterId: 'c1', title: "Why can't a PDA sign?", askers: ['Gio', 'Nika'], steps } },
      { seq: 1, kind: 'segment_start', data: { segment: 0, title: 'What is a PDA?' } },
      { seq: 2, kind: 'board', data: { steps } },
      { seq: 12, kind: 'segment_start', data: { segment: 1, title: 'Bumps' } },
      { seq: 5, kind: 'notice', data: { text: 'x', level: 'info' } },
    ]);
    expect(ch).toEqual([
      { seq: 1, kind: 'segment', title: 'What is a PDA?' },
      { seq: 9, kind: 'question', title: "Why can't a PDA sign?" },
      { seq: 12, kind: 'segment', title: 'Bumps' },
    ]);
  });
});

describe('countKudos', () => {
  const me = 'u1';
  const clusters = [
    { id: 'a', route: 'class' as const, answered: true, asker_count: 3 },
    { id: 'b', route: 'inline' as const, answered: true, asker_count: 1 },
    { id: 'c', route: 'class' as const, answered: false, asker_count: 4 },
    { id: 'd', route: 'thread' as const, answered: true, asker_count: 2 },
    { id: 'e', route: 'inline' as const, answered: true, asker_count: 1 },
  ];
  it('counts answered class/inline questions shared by others, and shared threads', () => {
    const k = countKudos(me, [
      { author_id: me, cluster_id: 'a', votes: 1 }, // 2 other askers + 1 vote = 3
      { author_id: me, cluster_id: 'b', votes: 2 }, // alone, but 2 votes = 2
      { author_id: me, cluster_id: 'c', votes: 5 }, // not answered
      { author_id: me, cluster_id: 'd', votes: 5 }, // routed to a thread
      { author_id: me, cluster_id: 'e', votes: 0 }, // nobody else
      { author_id: me, cluster_id: null, votes: 3 }, // never grouped
      { author_id: 'u2', cluster_id: 'a', votes: 4 }, // not mine
    ], clusters, [
      { owner_id: me, shared_answer: 'PDAs have no key.' },
      { owner_id: me, shared_answer: null },
      { owner_id: me, shared_answer: '  ' },
      { owner_id: 'u2', shared_answer: 'x' },
    ]);
    expect(k).toEqual({ questionsHelped: 2, peopleHelped: 5, sharedThreads: 1 });
  });
  it('is zero for nothing', () => {
    expect(countKudos(me, [], [], [])).toEqual({ questionsHelped: 0, peopleHelped: 0, sharedThreads: 0 });
  });
});

describe('nextTopicId', () => {
  const md = '# PDAs\n\n- [x] Seeds  <!-- id: seeds -->\n- [ ] Bumps  <!-- id: bumps -->\n  - [ ] Canonical bump  <!-- id: canon -->\n- [ ] CPI signing\n';
  it('continues after the topic taught, in syllabus order', () => {
    expect(nextTopicId(md, 'seeds')).toBe('bumps');
    expect(nextTopicId(md, 'bumps')).toBe('canon');
    expect(nextTopicId(md, 'canon')).toBe('cpi-signing');
  });
  it('ends at the last topic; without a topic picks the first not done', () => {
    expect(nextTopicId(md, 'cpi-signing')).toBeNull();
    expect(nextTopicId(md, null)).toBe('bumps');
    expect(nextTopicId(undefined, 'seeds')).toBeNull();
    expect(nextTopicId('# Empty', null)).toBeNull();
  });
});

describe('minutesBetween', () => {
  it('rounds, at least one minute, null when not run', () => {
    expect(minutesBetween('2026-10-18T10:00:00Z', '2026-10-18T10:41:40Z')).toBe(42);
    expect(minutesBetween('2026-10-18T10:00:00Z', '2026-10-18T10:00:05Z')).toBe(1);
    expect(minutesBetween(null, '2026-10-18T10:00:05Z')).toBeNull();
  });
});
