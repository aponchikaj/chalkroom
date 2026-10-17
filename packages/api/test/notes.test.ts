// packages/api/test/notes.test.ts
import { describe, it, expect } from 'vitest';
import { mockPlan } from '@chalk/mock-tutor';
import { buildNotes } from '../src/notes/notes';

describe('buildNotes', () => {
  it('writes one block per segment, then takeaways and class questions', () => {
    const blocks = buildNotes({
      plan: mockPlan(),
      summaries: [{ segment: 0, title: 'What is a PDA?', summary: 'A PDA has no key.' }],
      checks: [{ segment: 0, prompt: 'Who can sign?', answerText: 'The program', explanation: 'No key.', correct: 1, total: 2 }],
      clusters: [{ title: 'Why can a PDA not sign?', answer: 'It has no private key.', askers: 2 }],
    });
    expect(blocks).toHaveLength(5);
    expect(blocks[0]).toBe('## What is a PDA?\n\nA PDA has no key.');
    expect(blocks[1]).toContain('Describe how find_program_address picks the bump.');
    expect(blocks[3]).toContain('**Who can sign?** The program. No key. (1/2 of the class got it)');
    expect(blocks[4]).toContain('**Why can a PDA not sign?** (2 asked) It has no private key.');
  });
});
