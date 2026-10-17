// packages/api/src/notes/notes.ts
// Pure: end-of-class notes from data the class already produced (no extra model call).
import type { LessonPlan } from '@chalk/schema';
import type { CheckResult, SummaryEntry } from '../conductor/narration';

export interface NotesInput {
  plan: LessonPlan;
  summaries: SummaryEntry[];
  checks: CheckResult[];
  clusters: { title: string; answer: string | null; askers: number }[];
}

export function buildNotes({ plan, summaries, checks, clusters }: NotesInput): string[] {
  const blocks = plan.segments.map((s, i) => `## ${s.title}\n\n${summaries.find((x) => x.segment === i)?.summary ?? s.objective}`);
  if (checks.length) {
    blocks.push(['## Key takeaways', '', ...checks.map((c) =>
      `- **${c.prompt}** ${c.answerText}.${c.explanation ? ` ${c.explanation}` : ''} (${c.correct}/${c.total} of the class got it)`)].join('\n'));
  }
  const answered = clusters.filter((c) => c.answer);
  if (answered.length) {
    blocks.push(['## Questions from class', '', ...answered.map((c) => `- **${c.title}** (${c.askers} asked) ${c.answer}`)].join('\n'));
  }
  return blocks;
}
