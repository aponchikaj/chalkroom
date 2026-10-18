import './env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppModule } from './app.module';
import { config, modelProblem } from './config';
import { RefundBadRequests } from './core/rate-limit';

// every class needs a real model (there is no scripted tutor): refuse to start without one
const problem = modelProblem();
if (problem) {
  new Logger('API').error(`Cannot start: ${problem}`);
  process.exit(1);
}

const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
const local = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(process.env.SUPABASE_URL ?? '');
// behind the host's proxy (Render, Fly): req.ip is the client, so per-IP rate limits work
if (!local) app.set('trust proxy', 1);
// JSON bodies only, 1 MB: notes and questions are small; files go straight to Storage
app.useBodyParser('json', { limit: '1mb' });
app.use((_req: unknown, res: { setHeader(k: string, v: string): void }, next: () => void) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
if (config.sandbox) {
  // dev console: packages/api/sandbox, plus supabase-js from node_modules so it works offline
  const supabaseUmd = join(dirname(createRequire(import.meta.url).resolve('@supabase/supabase-js')), 'umd');
  app.useStaticAssets(supabaseUmd, { prefix: '/sandbox/vendor/' });
  app.useStaticAssets(fileURLToPath(new URL('../sandbox/', import.meta.url)), { prefix: '/sandbox/' });
}
// the web app's origins (WEB_URL); any local origin only while developing against the local stack
app.enableCors({ origin: local ? [...config.webOrigins, /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):\d+$/] : config.webOrigins, credentials: true });
// a refused body or parameter (400) does not use up a rate limit
app.useGlobalFilters(new RefundBadRequests(app.getHttpAdapter()));
app.enableShutdownHooks();
await app.listen(config.port, '0.0.0.0');
new Logger('API').log(`listening on http://localhost:${config.port} (model: ${config.model})${config.sandbox ? `, sandbox on /sandbox/` : ''}`);
