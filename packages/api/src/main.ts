import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { config } from './config';

const app = await NestFactory.create(AppModule);
app.enableCors({ origin: [config.webUrl, /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):\d+$/], credentials: true });
app.enableShutdownHooks();
await app.listen(config.port, '0.0.0.0');
new Logger('API').log(`listening on http://localhost:${config.port} (model: ${config.model})`);
