// Pure pieces of the Groq adapter (OpenAI-compatible chat completions): request mapping and the
// streamed-response reader. No network, no config, so both are unit-tested.
import type { ModelEvent, ModelRequest } from './model.port';

type Block = { type: string; [k: string]: unknown };

const safeJson = (s: string): unknown => { try { return JSON.parse(s); } catch { return null; } };
type GroqMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string };

const text = (content: unknown) => (typeof content === 'string' ? content : (content as Block[]).filter((b) => b.type === 'text').map((b) => b.text as string).join('\n'));

/** Our ModelRequest (Anthropic-shaped messages, one forced tool) as a Groq chat completion body. */
export function toGroqBody(req: ModelRequest, model: string, maxTokens: number) {
  const messages: GroqMessage[] = [{ role: 'system', content: `${req.prefix}\n\n${req.system}` }];
  for (const m of req.messages) {
    const blocks = typeof m.content === 'string' ? null : (m.content as unknown as Block[]);
    if (m.role === 'assistant' && blocks?.some((b) => b.type === 'tool_use')) {
      messages.push({
        role: 'assistant', content: null,
        tool_calls: blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id as string, type: 'function', function: { name: b.name as string, arguments: JSON.stringify(b.input) } })),
      });
    } else if (m.role === 'user' && blocks?.some((b) => b.type === 'tool_result')) {
      for (const b of blocks.filter((x) => x.type === 'tool_result')) messages.push({ role: 'tool', tool_call_id: b.tool_use_id as string, content: text(b.content) });
    } else {
      messages.push({ role: m.role, content: text(m.content) } as GroqMessage);
    }
  }
  return {
    model,
    max_tokens: maxTokens,
    stream: true,
    stream_options: { include_usage: true },
    messages,
    tools: [{ type: 'function', function: { name: req.tool.name, description: req.tool.description, parameters: req.tool.input_schema } }],
    tool_choice: { type: 'function', function: { name: req.tool.name } },
  };
}

interface Usage { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }

/** Reads Groq's server-sent events; yields tool_delta per argument fragment, then tool and done. */
export class GroqStream {
  private buf = '';
  private name = '';
  private args = '';
  private finish: string | null = null;
  private usage: Usage | null = null;
  private text = '';
  private gotTool = false;
  private error: string | null = null;

  push(chunk: string): ModelEvent[] {
    this.buf += chunk;
    const out: ModelEvent[] = [];
    let cut: number;
    while ((cut = this.buf.indexOf('\n\n')) >= 0) {
      const raw = this.buf.slice(0, cut);
      this.buf = this.buf.slice(cut + 2);
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        const ev = JSON.parse(data) as { error?: { message?: string; code?: string; failed_generation?: string }; choices?: { delta?: { content?: string | null; tool_calls?: { function?: { name?: string; arguments?: string } }[] }; finish_reason?: string | null }[]; usage?: Usage | null; x_groq?: { usage?: Usage } };
        if (ev.error) {
          // Groq validates tool calls itself; when it refuses one, the generation is still here:
          // hand it to our own Zod validation (and the repair pass) instead of losing it
          const gen = ev.error.code === 'tool_use_failed' && ev.error.failed_generation ? safeJson(ev.error.failed_generation) as { name?: string; arguments?: unknown } | null : null;
          if (gen?.name && gen.arguments !== undefined) {
            this.name = gen.name;
            this.args = typeof gen.arguments === 'string' ? gen.arguments : JSON.stringify(gen.arguments);
          } else this.error = ev.error.message ?? 'stream error';
          continue;
        }
        const choice = ev.choices?.[0];
        if (choice?.delta?.content) this.text += choice.delta.content;
        for (const call of choice?.delta?.tool_calls ?? []) {
          if (call.function?.name) this.name = call.function.name;
          const piece = call.function?.arguments;
          if (piece) { this.args += piece; out.push({ type: 'tool_delta', partialJson: piece }); }
        }
        if (choice?.finish_reason) this.finish = choice.finish_reason;
        const u = ev.usage ?? ev.x_groq?.usage;
        if (u) this.usage = u;
      }
    }
    return out;
  }

  /** After end(): why no tool came back (null when one did). */
  missingTool(): string | null {
    if (this.gotTool) return null;
    return `${this.error ? `error: ${this.error}; ` : ''}finish ${this.finish ?? 'none'}${this.name ? ', unparseable arguments' : ''}${this.text ? `, text: "${this.text.slice(0, 60)}"` : ''}`;
  }

  end(): ModelEvent[] {
    const out: ModelEvent[] = [];
    if (this.name) {
      try { out.push({ type: 'tool', name: this.name, input: JSON.parse(this.args || '{}') }); this.gotTool = true; } catch { /* incomplete JSON: no tool */ }
    }
    const cached = this.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    out.push({
      type: 'done', stopReason: this.finish,
      usage: this.usage ? { input: (this.usage.prompt_tokens ?? 0) - cached, output: this.usage.completion_tokens ?? 0, cacheRead: cached, cacheWrite: 0 } : undefined,
    });
    return out;
  }
}

/** "36.21s", "7m12s", "577ms", "1m26.4s" -> milliseconds (Groq's x-ratelimit-reset-* headers). */
export function parseDuration(s: string | null): number {
  if (!s) return 0;
  let ms = 0;
  for (const [, n, unit] of s.matchAll(/([\d.]+)(ms|m|s|h)/g)) ms += Number(n) * (unit === 'ms' ? 1 : unit === 's' ? 1000 : unit === 'm' ? 60_000 : 3_600_000);
  return Math.round(ms);
}

/** Free-tier pacing per model: Groq allows ~8000 tokens per minute and reports what is left
 *  after every call. A call that will not fit waits until the reset instead of failing. */
export class RateWindow {
  private remaining: number | null = null;
  private resetAt = 0;

  update(h: { remaining: number | null; resetMs: number }, now: number) {
    if (h.remaining === null) return;
    this.remaining = h.remaining;
    this.resetAt = now + h.resetMs;
  }

  /** ms to wait before spending `tokens` (0 when it fits or nothing is known) */
  waitMs(tokens: number, now: number): number {
    if (this.remaining === null || now >= this.resetAt || tokens <= this.remaining) return 0;
    return this.resetAt - now;
  }

  /** count a call that is about to run against the window */
  spend(tokens: number) {
    if (this.remaining !== null) this.remaining = Math.max(0, this.remaining - tokens);
  }
}
