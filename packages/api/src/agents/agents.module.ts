import { Global, Logger, Module } from '@nestjs/common';
import { config } from '../config';
import { ModelPort } from './model.port';
import { MockModel } from './mock.model';
import { AnthropicModel, FallbackModel } from './anthropic.model';
import { MeteredModel, UsageMeter } from './metered.model';
import { GroqModel } from './groq.model';
import { LeadTutorAgent } from './lead-tutor.agent';
import { TriageAgent } from './triage.agent';
import { ThreadTutorAgent } from './thread-tutor.agent';
import { ScribeAgent } from './scribe.agent';

const log = new Logger('Model');

@Global()
@Module({
  providers: [
    UsageMeter,
    {
      provide: ModelPort,
      inject: [UsageMeter],
      useFactory: (meter: UsageMeter) => {
        const usage = (m: string) => log.log(m);
        if (config.model === 'mock') {
          log.log('Using the scripted mock tutor (MODEL=mock)');
          return new MeteredModel(new MockModel(), meter, usage);
        }
        const real = config.model === 'groq' ? new GroqModel(process.env.GROQ_API_KEY ?? '', (agent, tool) => (tool === 'plan_lesson' ? config.agentModels.triage : tool === 'answer_cluster' ? config.agentModels.triage : config.agentModels[agent]), undefined,
          // spares when a model is out of its daily budget or refuses a request's size
          config.groqSpares) : new AnthropicModel();
        log.log(`Using ${real.name} (${Object.entries(config.agentModels).map(([a, m]) => `${a}: ${m}`).join(', ')}), falling back to the mock tutor on errors`);
        return new MeteredModel(new FallbackModel(real, new MockModel(), (m) => log.warn(m)), meter, usage, { tokens: config.roomTokenBudget, fallback: new MockModel() });
      },
    },
    LeadTutorAgent, TriageAgent, ThreadTutorAgent, ScribeAgent,
  ],
  exports: [ModelPort, UsageMeter, LeadTutorAgent, TriageAgent, ThreadTutorAgent, ScribeAgent],
})
export class AgentsModule {}
