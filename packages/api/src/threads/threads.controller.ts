// packages/api/src/threads/threads.controller.ts
// Threads: one personal side tutor per learner. Routes are fixed by @chalk/schema (Api.openThread etc.).
import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Api, type ClusterRow, type OkRes, type ThreadRow } from '@chalk/schema';
import { AuthGuard, CurrentUser, type AuthUser } from '../core/auth.guard';
import { ZodPipe } from '../core/zod.pipe';
import { ThreadsService } from './threads.service';
import { RateLimit } from '../core/rate-limit';

@Controller()
@UseGuards(AuthGuard)
export class ThreadsController {
  constructor(private threads: ThreadsService) {}

  @Post('rooms/:id/threads')
  @RateLimit('open-thread', 10, 60000)
  async open(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.openThread)) b: z.infer<typeof Api.openThread>, @Res({ passthrough: true }) res: Response): Promise<ThreadRow> {
    const { thread, created } = await this.threads.open(id, u.id, b);
    // 201 for a new thread, 200 for an accepted offer (the row existed)
    if (!created) res.status(200);
    return thread;
  }

  @Post('threads/:id/messages')
  @RateLimit('thread-message', 20, 60000)
  @HttpCode(202)
  async message(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.threadMessage)) b: z.infer<typeof Api.threadMessage>): Promise<OkRes> {
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
