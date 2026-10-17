// packages/api/src/threads/thread-context.ts
// Pure context builders for the thread tutor.
import type Anthropic from '@anthropic-ai/sdk';
import { applySteps, emptyBoard, type BoardState } from '@chalk/board';
import type { BoardStep, StreamEvent, StreamEventDataOf } from '@chalk/schema';

/** One learner line as the tutor reads it: labelled with the writer when classmates joined. */
export function learnerLine(markdown: string, authorId: string | undefined, names?: Record<string, string>): string {
  const who = names && authorId ? names[authorId] : undefined;
  return who ? `[${who}] ${markdown}` : markdown;
}

/**
 * Thread chat events as Messages API turns: starts with `user`, same-role lines merged.
 * With `names` (a joined thread), each learner line says who wrote it.
 */
export function chatHistory(events: StreamEvent[], names?: Record<string, string>): Anthropic.MessageParam[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const e of events) {
    if (e.kind !== 'chat') continue;
    const d = e.data as StreamEventDataOf<'chat'>;
    const role = d.role === 'learner' ? 'user' : 'assistant';
    const text = role === 'user' ? learnerLine(d.markdown, d.authorId, names) : d.markdown;
    const last = out.at(-1);
    if (last && last.role === role) last.content = `${last.content}\n\n${text}`;
    else out.push({ role, content: text });
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
