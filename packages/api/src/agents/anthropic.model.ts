// Claude through @anthropic-ai/sdk: streaming, one forced tool, prompt caching on the shared prefix.
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { ModelPort, type ModelEvent, type ModelRequest } from './model.port';

export class AnthropicModel extends ModelPort {
  readonly name = 'anthropic';
  private client = new Anthropic({ maxRetries: 2 });

  async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
    const stream = this.client.messages.stream({
      model: config.modelId,
      max_tokens: req.maxTokens ?? 8000,
      system: [
        { type: 'text', text: req.prefix, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: req.system },
      ],
      messages: req.messages,
      tools: [{ ...req.tool, input_schema: req.tool.input_schema as Anthropic.Tool.InputSchema, eager_input_streaming: true }],
      tool_choice: { type: 'tool', name: req.tool.name },
    });
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'input_json_delta') yield { type: 'tool_delta', partialJson: ev.delta.partial_json };
      else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') yield { type: 'text', text: ev.delta.text };
    }
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'max_tokens') throw new Error(`${req.agent}: hit max_tokens`);
    const use = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === req.tool.name);
    if (use) yield { type: 'tool', name: use.name, input: use.input };
    yield {
      type: 'done',
      stopReason: msg.stop_reason,
      usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens, cacheRead: msg.usage.cache_read_input_tokens ?? 0 },
    };
  }
}

/** Try the primary model; if it fails before producing anything, answer from the fallback. */
export class FallbackModel extends ModelPort {
  readonly name: string;
  constructor(private primary: ModelPort, private fallback: ModelPort, private log: (m: string) => void) {
    super();
    this.name = `${primary.name}→${fallback.name}`;
  }

  async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
    let produced = false;
    try {
      for await (const e of this.primary.stream(req)) {
        if (e.type === 'tool') produced = true;
        yield e;
      }
      return;
    } catch (err) {
      if (produced) throw err;
      this.log(`${req.agent}: ${this.primary.name} failed (${(err as Error).message}); using ${this.fallback.name}`);
    }
    yield* this.fallback.stream(req);
  }
}
