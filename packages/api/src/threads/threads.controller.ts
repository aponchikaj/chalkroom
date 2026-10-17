// packages/api/src/threads/threads.controller.ts
// Threads: one personal side tutor per learner. Routes are fixed by @chalk/schema (Api.openThread etc.).
import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Api, type ClusterRow, type ThreadRow } from '@chalk/schema';
import { AuthGuard, CurrentUser, type AuthUser } from '../core/auth.guard';
import { ZodPipe } from '../core/zod.pipe';
import { ThreadsService } from './threads.service';

@Controller()
@UseGuards(AuthGuard)
export class ThreadsController {
  constructor(private threads: ThreadsService) {}

  @Post('rooms/:id/threads')
  open(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.openThread)) b: z.infer<typeof Api.openThread>): Promise<ThreadRow> {
    return this.threads.open(id, u.id, b);
  }

  @Post('threads/:id/messages')
  @HttpCode(202)
  async message(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.threadMessage)) b: z.infer<typeof Api.threadMessage>) {
    await this.threads.message(id, u.id, b.text);
    return { ok: true };
  }

  /** Lane Q: a classmate peeking at an open thread joins it (Api.joinThread). */
  @Post('threads/:id/join')
  @HttpCode(200)
  join(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.joinThread)) _b: z.infer<typeof Api.joinThread>): Promise<ThreadRow> {
    return this.threads.join(id, u.id);
  }

  @Post('threads/:id/close')
  @HttpCode(204)
  close(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.threads.close(id, u.id);
  }

  @Post('threads/:id/share')
  share(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.shareThread)) b: z.infer<typeof Api.shareThread>): Promise<ClusterRow> {
    return this.threads.share(id, u.id, b.markdown);
  }
}
