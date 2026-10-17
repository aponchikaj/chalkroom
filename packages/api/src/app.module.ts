import { Controller, Get, Module } from '@nestjs/common';
import { config } from './config';
import { CoreModule } from './core/core.module';
import { AgentsModule } from './agents/agents.module';
import { RoomsService } from './rooms/rooms.service';
import { RoomsController } from './rooms/rooms.controller';
import { ConductorService } from './conductor/conductor.service';
import { QuestionsController } from './questions/questions.controller';
import { ThreadsController } from './threads/threads.controller';

@Controller()
class HealthController {
  @Get('health')
  health() { return { ok: true, model: config.model, modelId: config.model === 'mock' ? null : config.modelId }; }
}

/** Dev console settings (only mounted when config.sandbox). The anon key is public by design. */
@Controller('sandbox')
class SandboxController {
  @Get('config.json')
  settings() {
    return { supabaseUrl: process.env.VITE_SUPABASE_URL ?? config.supabaseUrl, anonKey: process.env.VITE_SUPABASE_ANON_KEY ?? null, model: config.model };
  }
}

@Module({
  imports: [CoreModule, AgentsModule],
  providers: [RoomsService, ConductorService],
  controllers: [HealthController, RoomsController, QuestionsController, ThreadsController, ...(config.sandbox ? [SandboxController] : [])],
})
export class AppModule {}
