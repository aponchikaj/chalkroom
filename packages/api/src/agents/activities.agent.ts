// Lane M: the tutor's side of the live activities. Writes quiz duel questions and critiques a
// teach-back. One validated tool call each, through ModelPort; a failure throws to the caller.
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { BoardStep, type LessonPlan, type Question } from '@chalk/schema';
import type { ModelPort } from './model.port';
import { callValidated, toolFrom } from './agent-utils';

const PROMPT = readFileSync(new URL('./prompts/activities.md', import.meta.url), 'utf8').trim();

/** One duel question as the model writes it: objective types only, so the server grades it. */
export const DuelQuestionIn = z.object({
  type: z.enum(['mcq', 'tf', 'numeric']),
  prompt: z.string().min(1).max(300),
  options: z.array(z.string().min(1).max(120)).min(2).max(6).optional().describe('mcq only'),
  answer: z.union([z.number(), z.boolean()]).describe('mcq: 0-based option index; tf: true/false; numeric: the number'),
  tolerance: z.number().min(0).optional().describe('numeric only'),
  topic: z.string().min(1).max(80).describe('the concept it tests, 2 to 6 words'),
  explanation: z.string().max(300).optional(),
}).superRefine((q, ctx) => {
  const bad = (message: string) => ctx.addIssue({ code: 'custom', message, path: ['answer'] });
  if (q.type === 'mcq') {
    if (!q.options) ctx.addIssue({ code: 'custom', message: 'mcq needs options', path: ['options'] });
    else if (typeof q.answer !== 'number' || !Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) bad('mcq answer must be an option index');
  } else if (q.type === 'tf' && typeof q.answer !== 'boolean') bad('tf answer must be true or false');
  else if (q.type === 'numeric' && (typeof q.answer !== 'number' || !Number.isFinite(q.answer))) bad('numeric answer must be a number');
});
export type DuelQuestionIn = z.infer<typeof DuelQuestionIn>;

export const DuelQuiz = z.object({ questions: z.array(DuelQuestionIn).min(1).max(10) });
export const TeachbackCritique = z.object({
  markdown: z.string().min(1).max(2000),
  missing: z.array(z.string().max(200)).max(8).default([]),
  steps: z.array(BoardStep).max(12).optional(),
});
export type TeachbackCritique = z.infer<typeof TeachbackCritique>;

const duelTool = toolFrom('write_duel', 'Write the quiz duel: quick objective questions on what was taught.', DuelQuiz as unknown as z.ZodObject);
const feedbackTool = toolFrom('teachback_feedback', 'Critique a learner\'s teach-back: what was right, what was missing.', TeachbackCritique);

export interface DuelContext {
  roomId?: string;
  prefix: string;
  plan: LessonPlan | null;
  /** the segment the class is at (0-based); questions cover segments 0..segment */
  segment: number;
  summaries: string[];
  count: number;
}

export class ActivitiesAgent {
  constructor(private model: ModelPort) {}

  /** `count` graded questions (ids d0, d1, ...), objective types only, tf without justification. */
  async writeDuel(c: DuelContext): Promise<Question[]> {
    const taught = c.plan ? c.plan.segments.slice(0, c.segment + 1).map((s, i) => `${i}. ${s.title}: ${s.objective}`).join('\n') : '(no plan)';
    const out = await callValidated(this.model, {
      agent: 'lead', roomId: c.roomId, prefix: c.prefix, system: PROMPT, tool: duelTool, maxTokens: 1800,
      messages: [{ role: 'user', content: `Quiz duel: write ${c.count} questions.\n\nTaught so far:\n${taught}\n\nSegment summaries:\n${c.summaries.join('\n\n') || '(none yet)'}\n\nCall write_duel.` }],
    }, DuelQuiz);
    return out.questions.slice(0, c.count).map((q, i) => toQuestion(q, i));
  }

  async teachbackFeedback(c: { roomId?: string; prefix: string; concept: string; name: string; text: string }): Promise<TeachbackCritique> {
    return callValidated(this.model, {
      agent: 'lead', roomId: c.roomId, prefix: c.prefix, system: PROMPT, tool: feedbackTool, maxTokens: 1500,
      messages: [{ role: 'user', content: `Teach-back on: ${c.concept}\n\n${c.name} explained to the class:\n"""\n${c.text}\n"""\n\nCall teachback_feedback.` }],
    }, TeachbackCritique);
  }
}

export function toQuestion(q: DuelQuestionIn, i: number): Question {
  return {
    id: `d${i}`, type: q.type, prompt: q.prompt, difficulty: 2, answer: q.answer, topic: q.topic,
    ...(q.type === 'mcq' ? { options: q.options } : {}),
    ...(q.type === 'numeric' && q.tolerance !== undefined ? { tolerance: q.tolerance } : {}),
    ...(q.explanation ? { explanation: q.explanation } : {}),
  };
}
