import { describe, it, expect } from 'vitest';
import { LessonPlan, PublicQuestion, TeachSegment, TriageResult, parseEventData } from '@chalk/schema';
import { applySteps, emptyBoard } from '@chalk/board';
import { PDA_SEGMENTS, mockClusterAnswer, mockPlan, mockTriage } from '../src/index';

describe('scripted lesson', () => {
  it('matches the contracts the API validates against', () => {
    expect(LessonPlan.safeParse(mockPlan()).success).toBe(true);
    for (const seg of PDA_SEGMENTS) {
      expect(TeachSegment.safeParse(seg).success).toBe(true);
      const pub = PublicQuestion.parse(seg.check);
      expect('answer' in pub).toBe(false);
      expect(() => parseEventData('board', { steps: seg.steps })).not.toThrow();
      expect(applySteps(emptyBoard(), seg.steps).errors).toEqual([]);
    }
    expect(() => parseEventData('answer_cluster', { clusterId: 'c', title: 't', askers: ['Ana'], steps: mockClusterAnswer('Why?', ['Ana', 'Gio']) })).not.toThrow();
  });
});

describe('mock triage', () => {
  it('groups two phrasings of one question and routes it to the class', () => {
    const r = TriageResult.parse(mockTriage({
      questions: [
        { id: 'q1', text: 'Why can a PDA not sign transactions?', authorId: 'u1' },
        { id: 'q2', text: 'why cant PDA sign transactions', authorId: 'u2' },
      ],
      clusters: [],
      history: {},
    }));
    expect(r.assign.map((a) => a.cluster)).toEqual(['new', 'new']);
    expect(r.assign[0].title).toBe(r.assign[1].title);
    expect(r.route).toEqual([expect.objectContaining({ cluster: r.assign[0].title, to: 'class' })]);
  });

  it('offers a thread on the third question about one subtopic', () => {
    const r = mockTriage({
      questions: [{ id: 'q3', text: 'how is the bump seed chosen exactly', authorId: 'u3' }],
      clusters: [],
      history: { u3: ['what is a bump seed', 'why does the bump seed start at 255'] },
    });
    expect(r.route[0]).toMatchObject({ to: 'thread', user: 'u3' });
  });
});
