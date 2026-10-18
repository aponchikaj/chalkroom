// packages/api/src/agents/teach-stream.ts
// teach_segment, streamed: each complete step is validated and drawn as soon as it is written
// (UX rule 6); the final tool input is still validated in full and fills any gap. A model that
// emits no deltas takes the final-input path.
import { BoardStep, Question, TeachSegment } from '@chalk/schema';
import type { ModelPort, ModelRequest } from './model.port';
import { StepStreamer } from './step-streamer';
import { undoDoubleEscapes } from './groq';

export type TeachChunk = { steps: BoardStep[] } | { check: Question };

/** Nothing valid arrived: the caller runs the repair pass (callValidated). */
export class InvalidTeach extends Error {}

/** Chunks that end at a `say` step, so the board fills progressively. */
export function bySay(steps: BoardStep[]): BoardStep[][] {
  const out: BoardStep[][] = [];
  let chunk: BoardStep[] = [];
  for (const s of steps) {
    chunk.push(s);
    if ('say' in s) { out.push(chunk); chunk = []; }
  }
  if (chunk.length) out.push(chunk);
  return out;
}

export async function* streamTeach(model: ModelPort, req: ModelRequest): AsyncGenerator<TeachChunk> {
  const streamer = new StepStreamer();
  let pending: BoardStep[] = [];
  let streamed = 0;
  let broken = false;
  let final: unknown;
  for await (const ev of model.stream(req)) {
    if (ev.type === 'tool') { final = ev.input; continue; }
    if (ev.type !== 'tool_delta' || broken) continue;
    for (const raw of streamer.push(ev.partialJson)) {
      // double-escaped text (seen from Gemini: a literal \n in labels) is cleaned on every provider
      const step = BoardStep.safeParse(undoDoubleEscapes(raw));
      if (!step.success) { broken = true; break; }
      pending.push(step.data);
      streamed++;
      if ('say' in step.data) { yield { steps: pending }; pending = []; }
    }
  }
  const out = TeachSegment.safeParse(undoDoubleEscapes(final));
  if (!out.success) {
    if (!streamed) throw new InvalidTeach(`teach_segment invalid: ${out.error.issues[0]?.message ?? 'no input'}`);
    if (pending.length) yield { steps: pending };
    const check = Question.safeParse((final as { check?: unknown } | undefined)?.check);
    if (check.success) yield { check: check.data };
    return;
  }
  for (const steps of bySay([...pending, ...out.data.steps.slice(streamed)])) yield { steps };
  if (out.data.check) yield { check: out.data.check };
}
