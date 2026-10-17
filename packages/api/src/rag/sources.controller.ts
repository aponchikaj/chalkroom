// RAG sources: list, upload a file (signed URL, then commit), add a link, delete.
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Api, type SourceRow, type SourceUploadRes } from '@chalk/schema';
import { AuthGuard, CurrentUser, type AuthUser } from '../core/auth.guard';
import { ZodPipe } from '../core/zod.pipe';
import { SourcesService } from './sources.service';
import { RateLimit } from '../core/rate-limit';

@Controller()
@UseGuards(AuthGuard)
export class SourcesController {
  constructor(private sources: SourcesService) {}

  @Get('rooms/:id/sources')
  list(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<SourceRow[]> {
    return this.sources.list(id, u.id);
  }

  @Post('rooms/:id/sources/upload-url')
  @RateLimit('source-upload', 30, 3600000)
  uploadUrl(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.sourceUploadUrl)) b: z.infer<typeof Api.sourceUploadUrl>): Promise<SourceUploadRes> {
    return this.sources.uploadUrl(id, u.id, b);
  }

  @Post('rooms/:id/sources')
  addFile(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.addSourceFile)) b: z.infer<typeof Api.addSourceFile>): Promise<SourceRow> {
    return this.sources.addFile(id, u.id, b);
  }

  @Post('rooms/:id/sources/url')
  @RateLimit('source-url', 30, 3600000)
  addUrl(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.addSourceUrl)) b: z.infer<typeof Api.addSourceUrl>): Promise<SourceRow> {
    return this.sources.addUrl(id, u.id, b);
  }

  @Delete('sources/:id')
  @HttpCode(204)
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.sources.remove(id, u.id);
  }
}
