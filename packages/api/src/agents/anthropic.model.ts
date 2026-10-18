// Claude through @anthropic-ai/sdk (production: Claude Sonnet 5.5): streaming, the agent's one
// tool offered with tool_choice auto, prompt caching on the shared prefix. Request shape:
// ./anthropic.params.ts (pure, tested).
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { ModelPort, type ModelEvent, type ModelRequest } from './model.port';
import { toAnthropicParams } from './anthropic.params';

export class AnthropicModel extends ModelPort {
  readonly name = 'anthropic';
  private client = new Anthropic({ maxRetries: 2 });

  async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
    const { stream: _s, ...params } = toAnthropicParams(req, config.agentModels[req.agent]);
    const stream = this.client.beta.messages.stream(params);
    for await (const ev of stream) {
      // thinking blocks (and progress updates) are skipped: only the tool input and text matter
      if (ev.type === 'content_block_delta' && ev.delta.type === 'input_json_delta') yield { type: 'tool_delta', partialJson: ev.delta.partial_json };
      else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') yield { type: 'text', text: ev.delta.text };
    }
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'max_tokens') throw new Error(`${req.agent}: hit max_tokens`);
    // declined even after the server-side fallback: the caller shows the failure
    if (msg.stop_reason === 'refusal') throw new Error(`${req.agent}: refused (${msg.stop_details?.category ?? 'no category'})`);
    const use = msg.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === req.tool.name);
    if (use) yield { type: 'tool', name: use.name, input: use.input };
    yield {
      type: 'done',
      stopReason: msg.stop_reason,
      usage: {
        input: msg.usage.input_tokens, output: msg.usage.output_tokens,
        cacheRead: msg.usage.cache_read_input_tokens ?? 0, cacheWrite: msg.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }
}
