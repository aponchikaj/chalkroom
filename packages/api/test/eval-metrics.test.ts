import { describe, it, expect } from 'vitest';
import { mockTeach } from '@chalk/mock-tutor';
import { hitAtK, pairwiseAgreement, reciprocalRank, scoreTeach } from '../eval/metrics';

describe('scoreTeach', () => {
  it('scores the mock segment as clean', () => {
    const s = scoreTeach(mockTeach(0));
    expect(s).toMatchObject({ reducerErrors: 0, danglingRefs: 0, maxShapesPerPage: 7, longSays: 0, hasCheck: true, checkComplete: true, pages: 1 });
    expect(s.says).toBe(3);
  });

  it('flags long narration, overfull pages, broken arrows and a missing check', () => {
    const steps = [
      ...Array.from({ length: 11 }, (_, i) => ({ add: { id: `b${i}`, kind: 'box', text: 'x' } })),
      { add: { id: 'e', kind: 'arrow', from: 'b0', to: 'nope' } },
      { say: Array.from({ length: 40 }, () => 'word').join(' ') },
    ];
    const s = scoreTeach({ title: 't', steps } as never);
    expect(s.maxShapesPerPage).toBe(12);
    expect(s.longSays).toBe(1);
    expect(s.danglingRefs).toBe(1);
    expect(s.hasCheck).toBe(false);
  });
});

describe('pairwiseAgreement', () => {
  it('compares groupings pair by pair', () => {
    const gold = { a: 'g1', b: 'g1', c: 'g2' };
    expect(pairwiseAgreement(gold, { a: 'x', b: 'x', c: 'y' })).toBe(1);
    expect(pairwiseAgreement(gold, { a: 'x', b: 'y', c: 'z' })).toBeCloseTo(2 / 3);
    expect(pairwiseAgreement(gold, { a: 'x', b: 'x', c: 'x' })).toBeCloseTo(1 / 3);
  });
});

describe('retrieval metrics', () => {
  it('computes hit@k and reciprocal rank', () => {
    expect(hitAtK(['x', 'y', 'z'], ['z'], 3)).toBe(1);
    expect(hitAtK(['x', 'y', 'z'], ['z'], 2)).toBe(0);
    expect(reciprocalRank(['x', 'y', 'z'], ['y', 'z'])).toBe(0.5);
    expect(reciprocalRank(['x'], ['y'])).toBe(0);
  });
});
