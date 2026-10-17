import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppModule } from './app.module';
import { config } from './config';

const app = await NestFactory.create<NestExpressApplication>(AppModule);
if (config.sandbox) {
  // dev console: packages/api/sandbox, plus supabase-js from node_modules so it works offline
  const supabaseUmd = join(dirname(createRequire(import.meta.url).resolve('@supabase/supabase-js')), 'umd');
  app.useStaticAssets(supabaseUmd, { prefix: '/sandbox/vendor/' });
  app.useStaticAssets(fileURLToPath(new URL('../sandbox/', import.meta.url)), { prefix: '/sandbox/' });
}
app.enableCors({ origin: [config.webUrl, /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):\d+$/], credentials: true });
app.enableShutdownHooks();
await app.listen(config.port, '0.0.0.0');
new Logger('API').log(`listening on http://localhost:${config.port} (model: ${config.model})${config.sandbox ? `, sandbox on /sandbox/` : ''}`);
