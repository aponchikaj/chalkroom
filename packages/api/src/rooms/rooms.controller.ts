import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Api, type CreateRoomRes, type JoinRoomRes, type OkRes, type RoomPreview } from '@chalk/schema';
import { AuthGuard, CurrentUser, type AuthUser } from '../core/auth.guard';
import { ZodPipe } from '../core/zod.pipe';
import { RoomsService } from './rooms.service';
import { ConductorService } from '../conductor/conductor.service';
import { RateLimit } from '../core/rate-limit';
import { ActivitiesService } from '../activities/activities.service';

@Controller('rooms')
export class RoomsController {
  constructor(private rooms: RoomsService, private conductor: ConductorService, private activities: ActivitiesService) {}

  /** Pre-join screen: no membership (and no auth) needed. */
  @Get('code/:code')
  @RateLimit('preview', 60, 60000)
  preview(@Param('code') code: string): Promise<RoomPreview> {
    return this.rooms.preview(code);
  }

  @Post()
  @RateLimit('create-room', 20, 3600000)
  @UseGuards(AuthGuard)
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(Api.createRoom)) body: z.infer<typeof Api.createRoom>): Promise<CreateRoomRes> {
    return this.rooms.create(u.id, body);
  }

  @Post('join')
  @RateLimit('join', 20, 60000)
  @UseGuards(AuthGuard)
  async join(@CurrentUser() u: AuthUser, @Body(new ZodPipe(Api.joinRoom)) body: z.infer<typeof Api.joinRoom>, @Res({ passthrough: true }) res: Response): Promise<JoinRoomRes> {
    const { room, member, created } = await this.rooms.join(u.id, body);
    void this.conductor.for(room.id).membersChanged();
    // 201 for a new member, 200 for one coming back
    if (!created) res.status(200);
    return { room, member };
  }

  @Post(':id/leave')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async leave(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.rooms.leave(id, u.id);
    await this.rooms.handOffHost(id);
    void this.conductor.for(id).membersChanged();
  }

  @Post(':id/start')
  @HttpCode(202)
  @UseGuards(AuthGuard)
  async start(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<OkRes> {
    const room = await this.rooms.requireHost(id, u.id);
    this.rooms.refuseEnded(room);
    if (room.phase !== 'lobby') throw new ConflictException('the class has already started');
    void this.conductor.for(id).start();
    return { ok: true };
  }

  @Post(':id/ready')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async ready(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.ready)) body: z.infer<typeof Api.ready>) {
    await this.rooms.ready(id, u.id, body.segment);
    void this.conductor.for(id).readyChanged();
  }

  @Post(':id/host')
  @HttpCode(202)
  @UseGuards(AuthGuard)
  async host(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.host)) body: z.infer<typeof Api.host>): Promise<OkRes> {
    const room = await this.rooms.requireHost(id, u.id);
    this.rooms.refuseEnded(room);
    // End stops a running duel or teach-back too: nobody is left to answer it
    if (body.action === 'end') this.activities.stop(id);
    void this.conductor.for(id).host(body.action);
    return { ok: true };
  }

  @Post(':id/moderate')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async moderate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.moderate)) body: z.infer<typeof Api.moderate>) {
    await this.rooms.requireHost(id, u.id);
    if (body.userId === u.id) throw new BadRequestException('you cannot moderate yourself');
    await this.rooms.moderate(id, body.userId, body.action);
    void this.conductor.for(id).membersChanged();
  }

  @Post(':id/checks/:checkId/answer')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  answer(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('checkId', ParseUUIDPipe) checkId: string,
    @Body(new ZodPipe(Api.checkAnswer)) body: z.infer<typeof Api.checkAnswer>) {
    return this.rooms.answerCheck(id, u.id, checkId, body.answer);
  }

  @Post(':id/reactions')
  @RateLimit('react', 120, 60000)
  @HttpCode(204)
  @UseGuards(AuthGuard)
  react(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.react)) body: z.infer<typeof Api.react>) {
    return this.rooms.react(id, u.id, body.shapeId, body.kind);
  }
}
