import { Global, Logger, Module } from '@nestjs/common';
import { config } from '../config';
import { ModelPort } from './model.port';
import { MockModel } from './mock.model';
import { AnthropicModel, FallbackModel } from './anthropic.model';
import { LeadTutorAgent } from './lead-tutor.agent';
import { TriageAgent } from './triage.agent';
import { ThreadTutorAgent } from './thread-tutor.agent';
import { ScribeAgent } from './scribe.agent';

const log = new Logger('Model');

@Global()
@Module({
  providers: [
    {
      provide: ModelPort,
      useFactory: () => {
        if (config.model === 'mock') {
          log.log('Using the scripted mock tutor (MODEL=mock)');
          return new MockModel();
        }
        log.log(`Using ${config.modelId}, falling back to the mock tutor on errors`);
        return new FallbackModel(new AnthropicModel(), new MockModel(), (m) => log.warn(m));
      },
    },
    LeadTutorAgent, TriageAgent, ThreadTutorAgent, ScribeAgent,
  ],
  exports: [ModelPort, LeadTutorAgent, TriageAgent, ThreadTutorAgent, ScribeAgent],
})
export class AgentsModule {}
