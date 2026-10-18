// packages/api/test/thread-context.test.ts
import { describe, it, expect } from 'vitest';
import { describeBoard } from '@chalk/board';
import { SAMPLE_SEGMENTS } from './fixtures';
import type { StreamEvent } from '@chalk/schema';
import { boardOf, chatHistory } from '../src/threads/thread-context';

let seq = 0;
const ev = (kind: string, data: unknown): StreamEvent => ({ stream_id: 's', room_id: 'r', seq: ++seq, kind, data, actor: 'x', t: '' } as StreamEvent);

describe('chatHistory', () => {
  it('starts with the learner, alternates roles and merges repeats', () => {
    const h = chatHistory([
      ev('chat', { role: 'tutor', markdown: 'Hi, what about bumps?' }),
      ev('chat', { role: 'learner', markdown: 'Why 255?' }),
      ev('chat', { role: 'learner', markdown: 'And why down?' }),
      ev('board', { steps: [{ say: 'x' }] }),
      ev('chat', { role: 'tutor', markdown: 'Because...' }),
    ]);
    expect(h).toEqual([
      { role: 'user', content: 'Why 255?\n\nAnd why down?' },
      { role: 'assistant', content: 'Because...' },
    ]);
  });
});

describe('boardOf', () => {
  it('replays board and answer_cluster steps of the main stream', () => {
    const state = boardOf([
      ev('board', { steps: SAMPLE_SEGMENTS[0].steps }),
      ev('segment_end', { segment: 0 }),
    ]);
    expect(describeBoard(state).shapes.map((s) => s.id)).toContain('pda');
  });
});
