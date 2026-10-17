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
import { ProfilesService } from './accounts/profiles.service';
import { MeController } from './accounts/me.controller';
import { UsersController } from './accounts/users.controller';
import { AvatarsService } from './accounts/avatars.service';
import { TwoFactorService } from './security/two-factor.service';
import { TwoFactorController } from './security/two-factor.controller';
import { ThreadStore } from './threads/thread-store';
import { TriageService } from './triage/triage.service';
import { ThreadsService } from './threads/threads.service';
import { NotesController } from './notes/notes.controller';
import { PresenceService } from './presence/presence.service';
import { SourcesService } from './rag/sources.service';
import { SourcesController } from './rag/sources.controller';
import { IngestWorker } from './rag/ingest.worker';
import { RetrieveService } from './rag/retrieve.service';
import { MailModule } from './mail/mail.module';
import { EmbeddingPort } from './rag/embeddings/embedding.port';
import { NoEmbeddings } from './rag/embeddings/no.embeddings';

@Controller()
class HealthController {
  @Get('health')
  health() { return { ok: true, model: config.model, modelId: config.model === 'mock' ? null : config.agentModels.lead, agents: config.model === 'mock' ? null : config.agentModels }; }
}

@Module({
  imports: [CoreModule, AgentsModule, MailModule],
  // One module wires every feature: feature modules would import each other in a cycle
  // (threads -> conductor -> triage -> thread offers). Folders, not modules, carry the structure.
  providers: [
    RoomsService, ConductorService, ProfilesService, AvatarsService, TwoFactorService, ThreadStore, TriageService, ThreadsService, PresenceService, SourcesService, IngestWorker, RetrieveService,
    // B12 swaps in the Voyage adapter when config.embeddings.provider is 'voyage'
    { provide: EmbeddingPort, useClass: NoEmbeddings },
  ],
  controllers: [HealthController, MeController, TwoFactorController, UsersController, RoomsController, QuestionsController, ThreadsController, NotesController, SourcesController, ...(config.sandbox ? [SandboxController] : [])],
})
export class AppModule {}
