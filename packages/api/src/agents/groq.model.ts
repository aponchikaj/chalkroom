// Groq (free tier) through its OpenAI-compatible chat completions API: streaming, one forced
// tool. Request mapping and stream reading live in ./groq.ts (pure, tested). A 429 is retried
// once after the server's retry-after (capped); anything else throws, and FallbackModel answers
// from the mock tutor.
import { Logger } from '@nestjs/common';
import { ModelPort, type AgentName, type ModelEvent, type ModelRequest } from './model.port';
import { GroqStream, RateWindow, parseDuration, toGroqBody } from './groq';

const URL = 'https://api.groq.com/openai/v1/chat/completions';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Longest an agent waits for free-tier quota before the mock answers instead. Triage is
 *  shortest: questions must leave `pending` within seconds. */
const MAX_WAIT_MS: Record<AgentName, number> = { triage: 6_000, lead: 60_000, thread: 30_000, scribe: 60_000 };
/** expected output tokens per call, for pacing */
const OUTPUT_GUESS = 1_000;

export class GroqModel extends ModelPort {
  readonly name = 'groq';
  private windows = new Map<string, RateWindow>();
  private log = new Logger('Groq');

  constructor(private apiKey: string, private modelFor: (agent: AgentName, tool: string) => string) {
    super();
  }

  private window(model: string) {
    let w = this.windows.get(model);
    if (!w) { w = new RateWindow(); this.windows.set(model, w); }
    return w;
  }

  private async post(body: { model: string }, maxWait: number, retried = false): Promise<Response> {
    const r = await fetch(URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    this.window(body.model).update({
      remaining: r.headers.get('x-ratelimit-remaining-tokens') === null ? null : Number(r.headers.get('x-ratelimit-remaining-tokens')),
      resetMs: parseDuration(r.headers.get('x-ratelimit-reset-tokens')),
    }, Date.now());
    if (r.status === 429 && !retried) {
      const wait = Math.max(1000 * Number(r.headers.get('retry-after') ?? 0), parseDuration(r.headers.get('x-ratelimit-reset-tokens')), 1_000);
      if (wait <= maxWait) {
        this.log.log(`${body.model}: rate limited, retrying in ${Math.round(wait / 1000)} s`);
        await sleep(wait);
        return this.post(body, maxWait, true);
      }
    }
    return r;
  }

  async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
    const model = this.modelFor(req.agent, req.tool.name);
    const body = toGroqBody(req, model, req.maxTokens ?? 8000);
    const need = Math.ceil(JSON.stringify(body).length / 4) + OUTPUT_GUESS;
    const w = this.window(model);
    const wait = w.waitMs(need, Date.now());
    if (wait > MAX_WAIT_MS[req.agent]) throw new Error(`${req.agent}: groq ${model} quota busy for ${Math.round(wait / 1000)} s`);
    if (wait) { this.log.log(`${req.agent}: waiting ${Math.round(wait / 1000)} s for ${model} quota`); await sleep(wait); }
    w.spend(need);
    const r = await this.post(body, MAX_WAIT_MS[req.agent]);
    if (!r.ok || !r.body) throw new Error(`${req.agent}: groq ${r.status} ${(await r.text()).slice(0, 300)}`);
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    const s = new GroqStream();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const ev of s.push(decoder.decode(value, { stream: true }))) yield ev;
    }
    const tail = s.end();
    const done = tail.at(-1) as Extract<ModelEvent, { type: 'done' }>;
    if (done.stopReason === 'length') throw new Error(`${req.agent}: groq hit max_tokens`);
    // no tool call (a text reply or broken JSON): throw, so FallbackModel answers instead
    const why = s.missingTool();
    if (why) throw new Error(`${req.agent}: groq ${model} returned no ${req.tool.name} call (${why})`);
    for (const ev of tail) yield ev;
  }
}
