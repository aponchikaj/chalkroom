// packages/api/test/courses-faq.test.ts
// FAQ reuse (lane C): triage answers questions the course FAQ already covers, without a model call.
import { describe, it, expect } from 'vitest';
import { FALLBACK_ANSWER } from '../src/triage/triage-plan';
import { matchFaq, mergeFaq, overlap } from '../src/triage/faq-match';

const q = (id: string, text: string, authorId = 'u1') => ({ id, text, authorId });
const f = (id: string, question: string, answer: string, askers_total = 1, topic_id: string | null = null, created_at = '2026-10-18T10:00:00Z') =>
  ({ id, course_id: 'c1', topic_id, question, answer, askers_total, created_at });

const FAQ = [
  f('f1', 'Why can a PDA not sign a transaction?', 'A PDA has no private key; only its program signs for it with invoke_signed.', 3),
  f('f2', 'What is a bump seed?', 'The first value from 255 down that pushes the address off the curve.', 2),
];

describe('matchFaq', () => {
  it('answers a reworded question from the FAQ and leaves new ones for triage', () => {
    const { hits, rest } = matchFaq([q('q1', "why can't a PDA sign transactions?"), q('q2', 'How do I deploy to devnet?')], FAQ);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ questionId: 'q1', faq: { id: 'f1' } });
    expect(rest.map((x) => x.id)).toEqual(['q2']);
  });

  it('does not reuse on one shared word', () => {
    expect(overlap('what is a PDA account owner', 'Why can a PDA not sign a transaction?')).toBe(0);
    expect(matchFaq([q('q1', 'what is a PDA account owner')], FAQ).hits).toHaveLength(0);
  });

  it('skips fallback answers and empty FAQs', () => {
    expect(matchFaq([q('q1', 'What is a bump seed?')], [f('x', 'What is a bump seed?', FALLBACK_ANSWER)]).hits).toHaveLength(0);
    expect(matchFaq([q('q1', 'anything')], []).rest).toHaveLength(1);
  });

  it('prefers the entry of the room topic on a tie', () => {
    const faq = [f('a', 'What is a bump seed?', 'one', 1, 'other'), f('b', 'what is the bump seed', 'two', 1, 'pdas')];
    expect(matchFaq([q('q1', 'what is a bump seed')], faq, 'pdas').hits[0].faq.id).toBe('a'); // merged: same question
    const distinct = [f('a', 'bump seed meaning explained', 'one', 1, 'other'), f('b', 'bump seed meaning in practice', 'two', 1, 'pdas')];
    expect(matchFaq([q('q1', 'bump seed meaning')], distinct, 'pdas').hits[0].faq.id).toBe('b');
  });
});

describe('mergeFaq', () => {
  it('merges repeats of one question: oldest answer, summed askers, most asked first', () => {
    const rows = mergeFaq([
      f('new', 'What is a bump seed?', 'later answer', 4, null, '2026-10-18T12:00:00Z'),
      f('old', 'what is a bump seed', 'first answer', 1, null, '2026-10-18T09:00:00Z'),
      f('other', 'Why can a PDA not sign?', 'no key', 2),
    ]);
    expect(rows.map((r) => [r.id, r.answer, r.askers_total])).toEqual([['old', 'first answer', 5], ['other', 'no key', 2]]);
  });
});
