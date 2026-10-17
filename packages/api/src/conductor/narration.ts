// packages/api/src/conductor/narration.ts
// Pure readers over the main stream's events, for the scribe and the notes.
import type { BoardStep, StreamEvent, StreamEventDataOf } from '@chalk/schema';

export interface CheckResult { segment: number; prompt: string; answerText: string; explanation?: string; correct: number; total: number }
export interface SummaryEntry { segment: number; title: string; summary: string }

/** What the class heard in one segment: its `say` lines and the check prompt. */
export function segmentTranscript(events: StreamEvent[], segment: number): string {
  const lines: string[] = [];
  let current = -1;
  for (const e of events) {
    if (e.kind === 'segment_start') current = (e.data as StreamEventDataOf<'segment_start'>).segment;
    else if (e.kind === 'segment_end' && current === segment) break;
    else if (current !== segment) continue;
    else if (e.kind === 'board') for (const s of (e.data as { steps: BoardStep[] }).steps) { if ('say' in s) lines.push(s.say); }
    else if (e.kind === 'check') lines.push(`Check: ${(e.data as StreamEventDataOf<'check'>).question.prompt}`);
  }
  return lines.join('\n');
}

export function checkResults(events: StreamEvent[]): CheckResult[] {
  const asked = new Map<string, { segment: number; prompt: string }>();
  const out: CheckResult[] = [];
  for (const e of events) {
    if (e.kind === 'check') {
      const d = e.data as StreamEventDataOf<'check'>;
      asked.set(d.checkId, { segment: d.segment, prompt: d.question.prompt });
    } else if (e.kind === 'check_closed') {
      const d = e.data as StreamEventDataOf<'check_closed'>;
      const a = asked.get(d.checkId);
      if (a) out.push({ ...a, answerText: d.answerText, explanation: d.explanation, correct: d.spread.correct, total: d.spread.total });
    }
  }
  return out;
}

export function summariesOf(events: StreamEvent[]): SummaryEntry[] {
  return events.filter((e) => e.kind === 'segment_summary').map((e) => e.data as StreamEventDataOf<'segment_summary'>);
}
