import { Controller, Get, Module } from '@nestjs/common';
import { config } from './config';
import { CoreModule } from './core/core.module';
import { AgentsModule } from './agents/agents.module';
import { RoomsService } from './rooms/rooms.service';
import { RoomsController } from './rooms/rooms.controller';
import { ConductorService } from './conductor/conductor.service';
import { QuestionsController } from './questions/questions.controller';
import { ThreadsController } from './threads/threads.controller';
import { SandboxController } from './sandbox/sandbox.controller';
import { MailModule } from './mail/mail.module';
import { EmbeddingPort } from './rag/embeddings/embedding.port';
import { NoEmbeddings } from './rag/embeddings/no.embeddings';

@Controller()
class HealthController {
  @Get('health')
  health() { return { ok: true, model: config.model, modelId: config.model === 'mock' ? null : config.modelId }; }
}

@Module({
  imports: [CoreModule, AgentsModule, MailModule],
  // One module wires every feature: feature modules would import each other in a cycle
  // (threads -> conductor -> triage -> thread offers). Folders, not modules, carry the structure.
  providers: [
    RoomsService, ConductorService,
    // B12 swaps in the Voyage adapter when config.embeddings.provider is 'voyage'
    { provide: EmbeddingPort, useClass: NoEmbeddings },
  ],
  controllers: [HealthController, RoomsController, QuestionsController, ThreadsController, ...(config.sandbox ? [SandboxController] : [])],
})
export class AppModule {}
