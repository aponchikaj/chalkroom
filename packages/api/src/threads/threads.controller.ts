// Threads: one personal side tutor per learner. Routes are fixed by the contract in
// @chalk/schema (Api.openThread etc.) so the web can build against them now.
// TODO(backend): implement — see docs/TASKS.md "B4 Threads".
import { Body, Controller, NotImplementedException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Api, type ThreadRow } from '@chalk/schema';
import { AuthGuard, CurrentUser, type AuthUser } from '../core/auth.guard';
import { ZodPipe } from '../core/zod.pipe';

@Controller()
@UseGuards(AuthGuard)
export class ThreadsController {
  /** Open a thread (or accept an offered one): create a `thread` stream + threads row, status open,
   *  left_main_seq = main stream's last_seq. One open thread per learner. */
  @Post('rooms/:id/threads')
  open(@CurrentUser() _u: AuthUser, @Param('id', ParseUUIDPipe) _id: string, @Body(new ZodPipe(Api.openThread)) _b: z.infer<typeof Api.openThread>): Promise<ThreadRow> {
    throw new NotImplementedException('threads: not built yet');
  }

  /** Learner message → `chat` event (learner) → ThreadTutorAgent.reply → `chat` (+ `board`) events. */
  @Post('threads/:id/messages')
  message(@CurrentUser() _u: AuthUser, @Param('id', ParseUUIDPipe) _id: string, @Body(new ZodPipe(Api.threadMessage)) _b: z.infer<typeof Api.threadMessage>) {
    throw new NotImplementedException('threads: not built yet');
  }

  /** Back to class: status closed; the client shows the catch-up card from left_main_seq. */
  @Post('threads/:id/close')
  close(@CurrentUser() _u: AuthUser, @Param('id', ParseUUIDPipe) _id: string) {
    throw new NotImplementedException('threads: not built yet');
  }

  /** Share to class: an answered cluster in the question rail with the thread's best answer. */
  @Post('threads/:id/share')
  share(@CurrentUser() _u: AuthUser, @Param('id', ParseUUIDPipe) _id: string, @Body(new ZodPipe(Api.shareThread)) _b: z.infer<typeof Api.shareThread>) {
    throw new NotImplementedException('threads: not built yet');
  }
}
