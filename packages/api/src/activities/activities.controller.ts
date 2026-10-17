// lane M: live activities in a class: quiz duel and teach-back: HTTP routes.
//   POST /rooms/:id/duel                 (host)       -> { duelId }
//   POST /rooms/:id/duel/answer          (member)     204
//   POST /rooms/:id/teachback            (host)       -> { teachbackId }
//   POST /rooms/:id/teachback/volunteer  (member)     204
//   POST /rooms/:id/teachback/explain    (volunteer)  204
import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { z } from 'zod';
import { Api } from '@chalk/schema';
import { AuthGuard, CurrentUser, type AuthUser } from '../core/auth.guard';
import { ZodPipe } from '../core/zod.pipe';
import { ActivitiesService } from './activities.service';

@Controller('rooms')
@UseGuards(AuthGuard)
export class ActivitiesController {
  constructor(private readonly svc: ActivitiesService) {}

  @Post(':id/duel')
  @HttpCode(201)
  startDuel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.startDuel)) body: z.infer<typeof Api.startDuel>) {
    return this.svc.startDuel(id, u.id, body);
  }

  @Post(':id/duel/answer')
  @HttpCode(204)
  duelAnswer(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.duelAnswer)) body: z.infer<typeof Api.duelAnswer>) {
    return this.svc.duelAnswer(id, u.id, body);
  }

  @Post(':id/teachback')
  @HttpCode(201)
  startTeachback(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.startTeachback)) body: z.infer<typeof Api.startTeachback>) {
    return this.svc.startTeachback(id, u.id, body);
  }

  @Post(':id/teachback/volunteer')
  @HttpCode(204)
  volunteer(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.teachbackVolunteer)) body: z.infer<typeof Api.teachbackVolunteer>) {
    return this.svc.teachbackVolunteer(id, u.id, body);
  }

  @Post(':id/teachback/explain')
  @HttpCode(204)
  explain(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.teachbackExplain)) body: z.infer<typeof Api.teachbackExplain>) {
    return this.svc.teachbackExplain(id, u.id, body);
  }
}
