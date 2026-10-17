// lane C: course catalog, course pages, fork, ratings, FAQ, the lobby of public rooms: HTTP routes.
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Api, type CourseCard, type CourseRow, type FaqRow, type LobbyRoom } from '@chalk/schema';
import { AuthGuard, CurrentUser, type AuthUser } from '../core/auth.guard';
import { ZodPipe } from '../core/zod.pipe';
import { CoursesService } from './courses.service';

@Controller()
@UseGuards(AuthGuard)
export class CoursesController {
  constructor(private readonly svc: CoursesService) {}

  @Get('courses')
  list(@CurrentUser() u: AuthUser, @Query('q') q?: string): Promise<CourseCard[]> {
    return this.svc.list(u.id, typeof q === 'string' ? q : undefined);
  }

  @Get('courses/:id')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<CourseCard> {
    return this.svc.card(id, u.id);
  }

  @Get('courses/:id/faq')
  faq(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<FaqRow[]> {
    return this.svc.faq(id, u.id);
  }

  @Post('courses')
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(Api.createCourse)) b: z.infer<typeof Api.createCourse>): Promise<CourseRow> {
    return this.svc.create(u.id, b);
  }

  @Patch('courses/:id')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.updateCourse)) b: z.infer<typeof Api.updateCourse>): Promise<CourseRow> {
    return this.svc.update(id, u.id, b);
  }

  @Post('courses/:id/fork')
  fork(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.forkCourse)) b: z.infer<typeof Api.forkCourse>): Promise<CourseRow> {
    return this.svc.fork(id, u.id, b);
  }

  @Post('courses/:id/rating')
  @HttpCode(204)
  async rate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.rateCourse)) b: z.infer<typeof Api.rateCourse>): Promise<void> {
    await this.svc.rate(id, u.id, b.stars);
  }

  @Get('lobby')
  lobby(): Promise<LobbyRoom[]> {
    return this.svc.lobby();
  }
}
