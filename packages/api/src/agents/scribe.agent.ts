// Scribe: segment summaries (catch-up cards, thread context) and end-of-class notes.
import { Injectable } from '@nestjs/common';
import { SegmentSummary } from '@chalk/schema';
import { mockSummary } from '@chalk/mock-tutor';
import { ModelPort } from './model.port';
import { callValidated, toolFrom } from './agent-utils';
import { PROMPTS } from './prompts';

const summarizeTool = toolFrom('summarize', 'Summarize a finished segment in 3 short lines.', SegmentSummary);

@Injectable()
export class ScribeAgent {
  constructor(private model: ModelPort) {}

  async summarize(prefix: string, title: string, transcript: string, roomId?: string): Promise<string> {
    const out = await callValidated(this.model, {
      agent: 'scribe', roomId, prefix, system: PROMPTS.scribe, tool: summarizeTool, maxTokens: 600,
      messages: [{ role: 'user', content: `Segment "${title}". What happened:\n${transcript}\n\nCall summarize.` }],
      mock: () => ({ summary: mockSummary(title) }),
    }, SegmentSummary);
    return out.summary;
  }
}
