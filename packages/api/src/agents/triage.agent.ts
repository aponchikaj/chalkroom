// Triage: groups new questions into clusters and routes them (class / later / inline / thread).
// The agent call is ready; wiring it into the room (debounce, DB updates, status chips,
// thread offers) is backend work, see docs/TASKS.md.
import { Injectable } from '@nestjs/common';
import { TriageResult } from '@chalk/schema';
import { mockTriage, type MockTriageInput } from '@chalk/mock-tutor';
import { ModelPort } from './model.port';
import { callValidated, toolFrom } from './agent-utils';
import { PROMPTS } from './prompts';

const triageTool = toolFrom('triage', 'Assign new questions to clusters and route each cluster.', TriageResult);

export interface TriageInput extends MockTriageInput {
  roomId?: string;
  prefix: string;
  segment: number;
  segmentTitle: string;
}

@Injectable()
export class TriageAgent {
  constructor(private model: ModelPort) {}

  run(input: TriageInput): Promise<TriageResult> {
    const body = JSON.stringify({
      currentSegment: { index: input.segment, title: input.segmentTitle },
      newQuestions: input.questions,
      openClusters: input.clusters,
      askerHistory: input.history,
    }, null, 1);
    return callValidated(this.model, {
      agent: 'triage', roomId: input.roomId, prefix: input.prefix, system: PROMPTS.triage, tool: triageTool, maxTokens: 1500,
      messages: [{ role: 'user', content: `${body}\n\nCall triage.` }],
      mock: () => mockTriage(input),
    }, TriageResult);
  }
}
