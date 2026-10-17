// Lead tutor: plans the lesson, teaches segments on `main`, answers class clusters.
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { BoardStep, LessonPlan, TeachSegment, type CheckSpread } from '@chalk/schema';
import { mockClusterAnswer, mockPlan, mockTeach } from '@chalk/mock-tutor';
import { ModelPort } from './model.port';
import { callValidated, toolFrom } from './agent-utils';
import { PROMPTS } from './prompts';

const planTool = toolFrom('plan_lesson', 'Plan the live lesson as 3–6 segments of 2–4 minutes.', LessonPlan);
const teachTool = toolFrom('teach_segment', 'Teach one segment on the shared board and end with a check.', TeachSegment);
const AnswerCluster = z.object({ steps: z.array(BoardStep).min(1).max(12) });
const answerTool = toolFrom('answer_cluster', 'Answer a grouped class question on the board, crediting the askers.', AnswerCluster);

export interface TeachContext {
  /** for usage metering and the room budget */
  roomId?: string;
  prefix: string;
  plan: LessonPlan;
  segment: number;
  slower: boolean;
  /** result of the previous segment's check, if any */
  lastCheck?: { prompt: string; spread: CheckSpread; answerText: string };
  /** scribe summaries of finished segments, oldest first */
  summaries: string[];
}

export type TeachChunk = { title: string } | { steps: BoardStep[] } | { check: NonNullable<TeachSegment['check']> };

@Injectable()
export class LeadTutorAgent {
  constructor(private model: ModelPort) {}

  plan(prefix: string, title: string, roomId?: string): Promise<LessonPlan> {
    return callValidated(this.model, {
      agent: 'lead', roomId, prefix, system: PROMPTS.lead, tool: planTool, maxTokens: 2000,
      messages: [{ role: 'user', content: `Plan a live lesson on "${title}" for this class. Call plan_lesson.` }],
      mock: () => mockPlan(),
    }, LessonPlan);
  }

  /**
   * One segment. Today this waits for the whole tool call and then yields it in chunks that
   * end at `say` steps, so the board still fills progressively.
   * TODO(backend): stream steps as the model writes them (parse ModelEvent.tool_delta) so
   * the first shape appears in ~1–2 s (design doc, UX rule 6).
   */
  async *teach(ctx: TeachContext): AsyncGenerator<TeachChunk> {
    const seg = ctx.plan.segments[ctx.segment];
    const notes = [
      `Teach segment ${ctx.segment}: "${seg.title}". Objective: ${seg.objective}`,
      ctx.slower ? 'The host asked to go slower: smaller steps, simpler words.' : '',
      ctx.lastCheck ? `Last check "${ctx.lastCheck.prompt}": ${ctx.lastCheck.spread.correct}/${ctx.lastCheck.spread.total} correct (answer: ${ctx.lastCheck.answerText}).` : '',
      ctx.summaries.length ? `So far:\n${ctx.summaries.join('\n')}` : '',
    ].filter(Boolean).join('\n');
    const out = await callValidated(this.model, {
      agent: 'lead', roomId: ctx.roomId, prefix: ctx.prefix, system: PROMPTS.lead, tool: teachTool,
      messages: [{ role: 'user', content: `${notes}\n\nCall teach_segment.` }],
      mock: () => mockTeach(ctx.segment),
    }, TeachSegment);
    yield { title: out.title };
    let chunk: BoardStep[] = [];
    for (const step of out.steps) {
      chunk.push(step);
      if ('say' in step) { yield { steps: chunk }; chunk = []; }
    }
    if (chunk.length) yield { steps: chunk };
    if (out.check) yield { check: out.check };
  }

  async answerCluster(prefix: string, title: string, questions: string[], askers: string[], roomId?: string): Promise<BoardStep[]> {
    const out = await callValidated(this.model, {
      agent: 'lead', roomId, prefix, system: PROMPTS.lead, tool: answerTool, maxTokens: 3000,
      messages: [{ role: 'user', content: `Q&A beat. Cluster "${title}", asked by ${askers.join(', ')}:\n${questions.map((q) => `- ${q}`).join('\n')}\n\nCall answer_cluster.` }],
      mock: () => ({ steps: mockClusterAnswer(title, askers) }),
    }, AnswerCluster);
    return out.steps;
  }
}
