// Server voice routes. A key is a content hash (ttsKeySource in @chalk/schema), so any signed-in
// user may ask about one; making a sentence is rate limited per account.
//   GET  /tts/:key  -> 200 { status: 'ready', url } | 202 { status: 'pending' } | 404 { status: 'missing' }
//   POST /tts {text} -> 200 { status: 'ready', url } | 202 { status: 'pending' }  (the sentence goes first in line)
import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Res, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import type { z } from 'zod';
import { Api, type TtsRes } from '@chalk/schema';
import { AuthGuard } from '../core/auth.guard';
import { RateLimit } from '../core/rate-limit';
import { ZodPipe } from '../core/zod.pipe';
import { TTS_KEY_RE } from './tts-key';
import { TtsService, ttsUrl } from './tts.service';

interface Reply { status(code: number): unknown }

@Controller('tts')
@UseGuards(AuthGuard)
export class TtsController {
  constructor(private tts: TtsService) {}

  @Get(':key')
  async status(@Param('key') key: string, @Res({ passthrough: true }) res: Reply): Promise<TtsRes> {
    if (!TTS_KEY_RE.test(key)) throw new NotFoundException({ key, status: 'missing' });
    const state = this.tts.queue.state(key);
    if (state === 'ready') return { key, status: 'ready', url: ttsUrl(key) };
    if (state === 'pending') { res.status(202); return { key, status: 'pending' }; }
    if (await this.tts.exists(key)) { this.tts.queue.markReady(key); return { key, status: 'ready', url: ttsUrl(key) }; }
    throw new NotFoundException({ key, status: 'missing' });
  }

  @Post()
  @HttpCode(202)
  @RateLimit('tts', 240, 60_000)
  async make(@Body(new ZodPipe(Api.tts)) body: z.infer<typeof Api.tts>, @Res({ passthrough: true }) res: Reply): Promise<TtsRes> {
    if (this.tts.engine === 'off') throw new ServiceUnavailableException('the server voice is off');
    const key = this.tts.queue.enqueue(body.text, true);
    if (this.tts.queue.state(key) === 'ready') { res.status(200); return { key, status: 'ready', url: ttsUrl(key) }; }
    return { key, status: 'pending' };
  }
}
