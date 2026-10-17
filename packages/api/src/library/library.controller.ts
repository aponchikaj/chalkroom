// lane L: replays of finished classes, booking the next session, kudos: HTTP routes.
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Api, type KudosRes, type ReplayCard, type ReplayRes, type RoomRow } from '@chalk/schema';
import { AuthGuard, CurrentUser, type AuthUser } from '../core/auth.guard';
import { ZodPipe } from '../core/zod.pipe';
import { LibraryService } from './library.service';

@Controller()
@UseGuards(AuthGuard)
export class LibraryController {
  constructor(private readonly svc: LibraryService) {}

  /** The replay library: finished public classes, newest first. */
  @Get('replays')
  replays(): Promise<ReplayCard[]> {
    return this.svc.replays();
  }

  /** One class to replay: members, or anyone signed in for a finished public class. */
  @Get('rooms/:id/replay')
  replay(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<ReplayRes> {
    return this.svc.replay(id, u.id);
  }

  /** Host: book the next session of this group. */
  @Post('rooms/:id/next')
  next(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(Api.nextSession)) body: z.infer<typeof Api.nextSession>): Promise<RoomRow> {
    return this.svc.next(id, u.id, body);
  }

  @Get('me/kudos')
  kudos(@CurrentUser() u: AuthUser): Promise<KudosRes> {
    return this.svc.kudos(u.id);
  }
}
