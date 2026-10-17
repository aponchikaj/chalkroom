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
        // free tiers (testing): planning and Q&A answers use the triage model, so the lead
        // tutor's own per-minute and per-day limits go to teaching
        const modelFor = (agent: keyof typeof config.agentModels, tool: string) => (tool === 'plan_lesson' || tool === 'answer_cluster' ? config.agentModels.triage : config.agentModels[agent]);
        const real = config.model === 'gemini'
          ? new GroqModel(process.env.GEMINI_API_KEY ?? '', modelFor, undefined, config.geminiSpares, undefined, 'gemini', config.geminiRpm)
          : config.model === 'groq'
            // spares when a model is out of its daily budget or refuses a request's size
            ? new GroqModel(process.env.GROQ_API_KEY ?? '', modelFor, undefined, config.groqSpares)
            : new AnthropicModel();
        log.log(`Using ${real.name} (${Object.entries(config.agentModels).map(([a, m]) => `${a}: ${m}`).join(', ')}), falling back to the mock tutor on errors`);
        return new MeteredModel(new FallbackModel(real, new MockModel(), (m) => log.warn(m)), meter, usage, { tokens: config.roomTokenBudget, fallback: new MockModel() });
      },
    },
    LeadTutorAgent, TriageAgent, ThreadTutorAgent, ScribeAgent,
  ],
  exports: [ModelPort, UsageMeter, LeadTutorAgent, TriageAgent, ThreadTutorAgent, ScribeAgent],
})
export class AgentsModule {}
