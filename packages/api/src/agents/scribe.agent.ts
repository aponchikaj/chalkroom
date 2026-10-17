// Scribe: segment summaries (catch-up cards, thread context), end-of-class notes and the class deck.
import { Injectable } from '@nestjs/common';
import { ProposedCards, SegmentSummary, type LessonPlan } from '@chalk/schema';
import { mockCards, mockSummary } from '@chalk/mock-tutor';
import { ModelPort } from './model.port';
import { callValidated, toolFrom } from './agent-utils';
import { PROMPTS } from './prompts';

const summarizeTool = toolFrom('summarize', 'Summarize a finished segment in 3 short lines.', SegmentSummary);
const cardsTool = toolFrom('propose_cards', 'Propose the class flashcard deck: 3 to 12 cards, one idea each.', ProposedCards);

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

  /** The class deck from the finished notes and check results. */
  async proposeCards(prefix: string, plan: LessonPlan, notes: string, checks: string, roomId?: string): Promise<ProposedCards['cards']> {
    const out = await callValidated(this.model, {
      agent: 'scribe', roomId, prefix, system: PROMPTS.scribe, tool: cardsTool, maxTokens: 1500,
      messages: [{ role: 'user', content: `The class has ended. Notes:\n${notes}\n\nChecks:\n${checks || '(none)'}\n\nCall propose_cards.` }],
      mock: () => mockCards(plan),
    }, ProposedCards);
    return out.cards;
  }
}
