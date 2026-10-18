import { Global, Logger, Module } from '@nestjs/common';
import { config, modelProblem } from '../config';
import { ModelPort } from './model.port';
import { AnthropicModel } from './anthropic.model';
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
        const problem = modelProblem();
        if (problem) throw new Error(problem);
        const usage = (m: string) => log.log(m);
        // free tiers (testing): planning and Q&A answers use the triage model, so the lead
        // tutor's own per-minute and per-day limits go to teaching
        const modelFor = (agent: keyof typeof config.agentModels, tool: string) => (tool === 'plan_lesson' || tool === 'answer_cluster' ? config.agentModels.triage : config.agentModels[agent]);
        const real = config.model === 'gemini'
          ? new GroqModel(process.env.GEMINI_API_KEY ?? '', modelFor, undefined, config.geminiSpares, undefined, 'gemini', config.geminiRpm)
          : config.model === 'groq'
            // spares when a model is out of its daily budget or refuses a request's size
            ? new GroqModel(process.env.GROQ_API_KEY ?? '', modelFor, undefined, config.groqSpares)
            : new AnthropicModel();
        log.log(`Using ${real.name} (${Object.entries(config.agentModels).map(([a, m]) => `${a}: ${m}`).join(', ')})`);
        return new MeteredModel(real, meter, usage, { tokens: config.roomTokenBudget });
      },
    },
    LeadTutorAgent, TriageAgent, ThreadTutorAgent, ScribeAgent,
  ],
  exports: [ModelPort, UsageMeter, LeadTutorAgent, TriageAgent, ThreadTutorAgent, ScribeAgent],
})
export class AgentsModule {}
