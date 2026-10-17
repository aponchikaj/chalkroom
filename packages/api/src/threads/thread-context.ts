// packages/api/src/threads/thread-context.ts
// Pure context builders for the thread tutor.
import type Anthropic from '@anthropic-ai/sdk';
import { applySteps, emptyBoard, type BoardState } from '@chalk/board';
import type { BoardStep, StreamEvent, StreamEventDataOf } from '@chalk/schema';

/** Thread chat events as Messages API turns: starts with `user`, same-role lines merged. */
export function chatHistory(events: StreamEvent[]): Anthropic.MessageParam[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const e of events) {
    if (e.kind !== 'chat') continue;
    const d = e.data as StreamEventDataOf<'chat'>;
    const role = d.role === 'learner' ? 'user' : 'assistant';
    const last = out.at(-1);
    if (last && last.role === role) last.content = `${last.content}\n\n${d.markdown}`;
    else out.push({ role, content: d.markdown });
  }
  while (out[0]?.role === 'assistant') out.shift();
  return out;
}

/** The main board as everyone sees it now: every board and Q&A step replayed in order. */
export function boardOf(events: StreamEvent[]): BoardState {
  let state = emptyBoard();
  for (const e of events) {
    if (e.kind === 'board' || e.kind === 'answer_cluster') state = applySteps(state, (e.data as { steps: BoardStep[] }).steps).state;
  }
  return state;
}
