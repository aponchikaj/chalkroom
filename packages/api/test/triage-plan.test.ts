// packages/api/test/triage-plan.test.ts
import { describe, it, expect } from 'vitest';
import { EMPTY_TRIAGE, FALLBACK_ANSWER, planTriage } from '../src/triage/triage-plan';

const q = (id: string, text: string, authorId: string) => ({ id, text, authorId });

describe('planTriage', () => {
  it('groups two learners asking the same thing into one class cluster', () => {
    const questions = [q('q1', 'Why can a PDA not sign?', 'u1'), q('q2', "Why can't a PDA sign transactions?", 'u2')];
    // the agent's answer: both questions in one new cluster (named by its title), sent to the class
    const result = {
      assign: [{ questionId: 'q1', cluster: 'new', title: 'Why can a PDA not sign?' }, { questionId: 'q2', cluster: 'new', title: 'Why can a PDA not sign?' }],
      route: [{ cluster: 'Why can a PDA not sign?', to: 'class' as const, reason: '2 askers' }],
      flag: [],
    };
    const plan = planTriage(result, questions, []);
    expect(plan.clusters).toHaveLength(1);
    expect(plan.clusters[0]).toMatchObject({ isNew: true, route: 'class', askerIds: ['u1', 'u2'] });
    expect(plan.questions.map((x) => x.status)).toEqual(['grouped', 'grouped']);
    expect(new Set(plan.questions.map((x) => x.clusterKey)).size).toBe(1);
  });

  it('answers a lone question inline', () => {
    const questions = [q('q1', 'What is a seed?', 'u1')];
    const result = {
      assign: [{ questionId: 'q1', cluster: 'new', title: 'What is a seed?' }],
      route: [{ cluster: 'What is a seed?', to: 'inline' as const, answer: 'A seed is a byte string that goes into the PDA hash.' }],
      flag: [],
    };
    const plan = planTriage(result, questions, []);
    expect(plan.clusters[0].route).toBe('inline');
    expect(plan.clusters[0].answer).toBeTruthy();
    expect(plan.questions[0].status).toBe('answered');
  });

  it('never leaves a question pending when the agent failed', () => {
    const questions = [q('q1', 'a', 'u1'), q('q2', 'b', 'u2')];
    const plan = planTriage(EMPTY_TRIAGE, questions, []);
    expect(plan.questions.every((x) => x.status === 'answered')).toBe(true);
    expect(plan.clusters.every((c) => c.route === 'inline' && c.answer === FALLBACK_ANSWER)).toBe(true);
  });

  it('flags without clustering', () => {
    const questions = [q('q1', 'spam spam', 'u1')];
    const plan = planTriage({ assign: [{ questionId: 'q1', cluster: 'new', title: 'spam' }], route: [], flag: [{ questionId: 'q1', reason: 'spam' }] }, questions, []);
    expect(plan.questions).toEqual([{ questionId: 'q1', clusterKey: null, status: 'flagged' }]);
    expect(plan.clusters).toHaveLength(0);
  });

  it('routes into an existing cluster for later', () => {
    const questions = [q('q1', 'How does invoke_signed work?', 'u2')];
    const clusters = [{ id: 'c1', title: 'invoke_signed', route: null, askerIds: ['u1'] }];
    const plan = planTriage({ assign: [{ questionId: 'q1', cluster: 'c1' }], route: [{ cluster: 'c1', to: 'later', segment: 2 }], flag: [] }, questions, clusters);
    expect(plan.clusters[0]).toMatchObject({ key: 'c1', isNew: false, route: 'later', targetSegment: 2, askerIds: ['u1', 'u2'] });
    expect(plan.questions[0]).toEqual({ questionId: 'q1', clusterKey: 'c1', status: 'later' });
  });

  it('matches new clusters by title regardless of case and offers a thread', () => {
    const questions = [q('q1', 'Bump seeds in depth?', 'u3')];
    const result = { assign: [{ questionId: 'q1', cluster: 'new', title: 'Bump seeds' }], route: [{ cluster: 'bump SEEDS ', to: 'thread' as const, user: 'u3' }], flag: [] };
    const plan = planTriage(result, questions, []);
    expect(plan.questions[0].status).toBe('thread');
    expect(plan.offers).toEqual([{ ownerId: 'u3', topic: 'Bump seeds', questionId: 'q1' }]);
  });
});
