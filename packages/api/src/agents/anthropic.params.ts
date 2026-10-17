// Pure: a ModelRequest -> Claude Messages API params (Claude Sonnet 5.5, the production model).
// Sonnet 5.5 rejects forced tool use (tool_choice "tool"/"any" is a 400) and "disabled"
// thinking, so the tool is offered with tool_choice auto and the system prompt names it; a reply
// without the call is caught by the caller (repair pass, then the mock tutor). Thinking stays
// adaptive and effort is set per agent. Refusals fall back server-side.
import type Anthropic from '@anthropic-ai/sdk';
import type { AgentName, ModelRequest } from './model.port';

type Effort = 'low' | 'medium' | 'high';
/** Starting points from the Sonnet 5.5 guidance: low for classification and short writing,
 *  medium for multistep tool work. Override with ANTHROPIC_EFFORT_<AGENT>. */
const EFFORT: Record<AgentName, Effort> = { lead: 'medium', thread: 'medium', triage: 'low', scribe: 'low' };
/** thinking counts toward max_tokens: room for it on top of the answer */
const THINKING_ROOM = 8000;

export function effortOf(agent: AgentName): Effort {
  const env = process.env[`ANTHROPIC_EFFORT_${agent.toUpperCase()}`];
  return env === 'low' || env === 'medium' || env === 'high' ? env : EFFORT[agent];
}

export function toAnthropicParams(req: ModelRequest, model: string): Anthropic.Beta.MessageCreateParamsStreaming {
  return {
    model,
    stream: true,
    max_tokens: (req.maxTokens ?? 8000) + THINKING_ROOM,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [
      { type: 'text', text: req.prefix, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `${req.system}\n\nAnswer by calling the ${req.tool.name} tool exactly once.` },
    ],
    messages: req.messages as Anthropic.Beta.BetaMessageParam[],
    tools: [{ name: req.tool.name, description: req.tool.description, input_schema: req.tool.input_schema as Anthropic.Beta.BetaTool.InputSchema, eager_input_streaming: true }],
    tool_choice: { type: 'auto' },
    output_config: { effort: effortOf(req.agent) },
  };
}
