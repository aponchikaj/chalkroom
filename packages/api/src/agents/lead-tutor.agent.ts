// Lead tutor: plans the lesson, teaches segments on `main`, answers class clusters.
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { BoardStep, LessonPlan, Question, TeachSegment, type CheckSpread } from '@chalk/schema';
import { ModelPort } from './model.port';
import { callValidated, toolFrom } from './agent-utils';
import { InvalidTeach, bySay, streamTeach, type TeachChunk } from './teach-stream';
import { PROMPTS } from './prompts';

const planTool = toolFrom('plan_lesson', 'Plan the live lesson as 3–6 segments of 2–4 minutes.', LessonPlan);
// The tool asks for the check as required: models (gpt-oss, qwen) skip optional fields, and a
// segment without a check leaves the gate with nothing to answer. Validation stays lenient
// (TeachSegment), so a reply without one is still taught rather than thrown away.
export const TEACH_TOOL = toolFrom('teach_segment', 'Teach one segment on the shared board and end with a check.', TeachSegment.extend({ check: Question }));
const teachTool = TEACH_TOOL;
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
  /** B6 retry after invalid Board Script: only the simplest steps */
  simple?: boolean;
  /** B12: retrieved passages (formatPassages), placed in the user turn */
  context?: string;
}

export type { TeachChunk } from './teach-stream';

@Injectable()
export class LeadTutorAgent {
  constructor(private model: ModelPort) {}

  plan(prefix: string, title: string, roomId?: string): Promise<LessonPlan> {
    return callValidated(this.model, {
      agent: 'lead', roomId, prefix, system: PROMPTS.lead, tool: planTool, maxTokens: 2000,
      messages: [{ role: 'user', content: `Plan a live lesson on "${title}" for this class. Call plan_lesson.` }],
    }, LessonPlan);
  }

  /**
   * One segment, streamed: each complete step is drawn as soon as the model writes it
   * (UX rule 6). If nothing valid arrives, the repair pass runs as before.
   */
  async *teach(ctx: TeachContext): AsyncGenerator<TeachChunk> {
    const seg = ctx.plan.segments[ctx.segment];
    const notes = [
      `Teach segment ${ctx.segment}: "${seg.title}". Objective: ${seg.objective}`,
      ctx.slower ? 'The host asked to go slower: smaller steps, simpler words.' : '',
      ctx.simple ? 'Keep the board simple: use only page, text, box, sticky and say steps, and still end with the check.' : '',
      ctx.context ?? '',
      ctx.lastCheck ? `Last check "${ctx.lastCheck.prompt}": ${ctx.lastCheck.spread.correct}/${ctx.lastCheck.spread.total} correct (answer: ${ctx.lastCheck.answerText}).` : '',
      ctx.summaries.length ? `So far:\n${ctx.summaries.join('\n')}` : '',
    ].filter(Boolean).join('\n');
    const req = {
      agent: 'lead' as const, roomId: ctx.roomId, prefix: ctx.prefix, system: PROMPTS.lead, tool: teachTool,
      messages: [{ role: 'user' as const, content: `${notes}\n\nCall teach_segment.` }],
    };
    try {
      yield* streamTeach(this.model, { ...req, streamed: true });
    } catch (e) {
      if (!(e instanceof InvalidTeach)) throw e;
      const out = await callValidated(this.model, req, TeachSegment);
      for (const steps of bySay(out.steps)) yield { steps };
      if (out.check) yield { check: out.check };
    }
  }

  async answerCluster(prefix: string, title: string, questions: string[], askers: string[], roomId?: string, context?: { text: string; cite?: string }): Promise<BoardStep[]> {
    const out = await callValidated(this.model, {
      agent: 'lead', roomId, prefix, system: PROMPTS.lead, tool: answerTool, maxTokens: 3000,
      messages: [{ role: 'user', content: `${context?.text ? `${context.text}\n\n` : ''}Q&A beat. Cluster "${title}", asked by ${askers.join(', ')}:\n${questions.map((q) => `- ${q}`).join('\n')}\n\nCall answer_cluster.` }],
    }, AnswerCluster);
    return out.steps;
  }
}
