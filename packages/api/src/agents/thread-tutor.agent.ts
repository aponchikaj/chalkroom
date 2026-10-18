// Thread tutor: one learner's personal tutor in the side drawer. Agent call only; the
// threads service (streams, history, catch-up) is backend work, see docs/TASKS.md.
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { BoardStep } from '@chalk/schema';
import { ModelPort } from './model.port';
import { callValidated, toolFrom } from './agent-utils';
import { PROMPTS } from './prompts';

export const ThreadReply = z.object({ markdown: z.string(), steps: z.array(BoardStep).max(15).optional() });
export type ThreadReply = z.infer<typeof ThreadReply>;
const replyTool = toolFrom('reply', 'Reply to the learner in the thread, optionally drawing on the mini board.', ThreadReply);

export interface ThreadContext {
  roomId?: string;
  /** B12: retrieved passages for the learner's message */
  context?: string;
  /** the room's shared prefix: the same bytes the lead tutor uses, so the cache is shared */
  prefix: string;
  /** describeBoard() of the main board right now */
  mainBoard: unknown;
  topic: string;
  history: Anthropic.MessageParam[];
}

@Injectable()
export class ThreadTutorAgent {
  constructor(private model: ModelPort) {}

  reply(ctx: ThreadContext, text: string): Promise<ThreadReply> {
    return callValidated(this.model, {
      agent: 'thread', roomId: ctx.roomId, prefix: ctx.prefix,
      system: `${PROMPTS.thread}\n\nThread topic: ${ctx.topic}\nMain board now: ${JSON.stringify(ctx.mainBoard)}`,
      tool: replyTool, maxTokens: 3000,
      messages: [...ctx.history, { role: 'user', content: ctx.context ? `${ctx.context}\n\n${text}` : text }],
    }, ThreadReply);
  }
}
