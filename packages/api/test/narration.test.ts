// packages/api/test/narration.test.ts
import { describe, it, expect } from 'vitest';
import { mockTeach } from '@chalk/mock-tutor';
import type { StreamEvent } from '@chalk/schema';
import { checkResults, segmentTranscript, summariesOf } from '../src/conductor/narration';

let seq = 0;
const ev = (kind: string, data: unknown): StreamEvent => ({ stream_id: 'm', room_id: 'r', seq: ++seq, kind, data, actor: 'lead', t: '' } as StreamEvent);
const seg0 = mockTeach(0);
const events = [
  ev('segment_start', { segment: 0, title: seg0.title }),
  ev('board', { steps: seg0.steps }),
  ev('check', { checkId: 'k0', segment: 0, question: { id: 'c1', type: 'mcq', prompt: 'Who can sign for a PDA?', options: ['a', 'b'] } }),
  ev('segment_end', { segment: 0 }),
  ev('segment_summary', { segment: 0, title: seg0.title, summary: 'S0' }),
  ev('check_closed', { checkId: 'k0', spread: { total: 2, correct: 1, counts: {} }, answer: 1, answerText: 'Only the program', explanation: 'No key.' }),
  ev('segment_start', { segment: 1, title: 'Finding the bump' }),
  ev('board', { steps: [{ say: 'Other segment.' }] }),
];

describe('narration', () => {
  it('collects only the segment narration and its check prompt', () => {
    const t = segmentTranscript(events, 0);
    expect(t).toContain('Normal accounts are owned by a keypair.');
    expect(t).toContain('Check: Who can sign for a PDA?');
    expect(t).not.toContain('Other segment.');
  });
  it('joins checks with their results', () => {
    expect(checkResults(events)).toEqual([{ segment: 0, prompt: 'Who can sign for a PDA?', answerText: 'Only the program', explanation: 'No key.', correct: 1, total: 2 }]);
  });
  it('lists summaries', () => {
    expect(summariesOf(events)).toEqual([{ segment: 0, title: seg0.title, summary: 'S0' }]);
  });
});
