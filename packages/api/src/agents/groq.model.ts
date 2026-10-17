// Groq (free tier) through its OpenAI-compatible chat completions API: streaming, one forced
// tool. Request mapping and stream reading live in ./groq.ts (pure, tested). A per-minute 429 is
// retried once after the server's retry-after (capped). A model out of its daily budget (TPD) is
// skipped until it is back, and a request above a model's output cap (OTPM) goes to the next
// spare; anything else throws, and FallbackModel answers from the mock tutor.
import { Logger } from '@nestjs/common';
import { ModelPort, type AgentName, type ModelEvent, type ModelRequest } from './model.port';
import { GroqStream, RateWindow, RequestWindow, dailyLimit, geminiLimit, parseDuration, toGroqBody, tooLarge, type CompatProvider, type ReasoningEffort } from './groq';

const URLS: Record<CompatProvider, string> = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Longest an agent waits for free-tier quota before the mock answers instead. Triage is
 *  shortest: questions must leave `pending` within seconds. */
const MAX_WAIT_MS: Record<AgentName, number> = { triage: 6_000, lead: 60_000, thread: 30_000, scribe: 60_000 };
/** expected output tokens per call, for pacing */
const OUTPUT_GUESS = 1_000;

/** A free-tier provider behind the OpenAI-compatible API: Groq (token limits, sent as headers)
 *  or Gemini (request limits per minute and per day, sent only in 429 bodies). */
export class GroqModel extends ModelPort {
  readonly name: string;
  private requests = new Map<string, RequestWindow>();
  private windows = new Map<string, RateWindow>();
  /** model -> time its daily budget (TPD) is back */
  private exhausted = new Map<string, number>();
  private log = new Logger('Groq');

  constructor(private apiKey: string, private modelFor: (agent: AgentName, tool: string) => string,
    private effortFor: (agent: AgentName, tool: string) => ReasoningEffort | undefined = () => undefined,
    /** models to try, in order, when an agent's own model has used its daily budget (or one
     *  list per agent: the tutors keep to the stronger models, triage to the cheap ones) */
    private spares: string[] | ((agent: AgentName) => string[]) = [],
    /** cap on waiting for per-minute quota; production uses the per-agent caps */
    private maxWaitFor: (agent: AgentName) => number = (a) => MAX_WAIT_MS[a],
    private provider: CompatProvider = 'groq',
    /** Gemini: requests per minute per model (the free tier's limit is not published) */
    private rpm = 10,
    /** pause before retrying an overloaded (5xx) model once */
    private overloadBackoffMs: () => number = () => 3000) {
    super();
    this.name = provider;
  }

  private sparesFor(agent: AgentName): string[] {
    return typeof this.spares === 'function' ? this.spares(agent) : this.spares;
  }

  private requestWindow(model: string) {
    let w = this.requests.get(model);
    if (!w) { w = new RequestWindow(this.rpm); this.requests.set(model, w); }
    return w;
  }

  /** When a model's daily budget is back (now or earlier when it is not exhausted). */
  availableAt(model: string): number {
    return this.exhausted.get(model) ?? 0;
  }

  private window(model: string) {
    let w = this.windows.get(model);
    if (!w) { w = new RateWindow(); this.windows.set(model, w); }
    return w;
  }

  private async post(body: { model: string }, maxWait: number, retried = false): Promise<Response> {
    const r = await fetch(URLS[this.provider], {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
      // Gemini sends a whole tool call at the end of a 20-30 s generation: a longer cap
      signal: AbortSignal.timeout(this.provider === 'gemini' ? 150_000 : 60_000),
    });
    this.window(body.model).update({
      remaining: r.headers.get('x-ratelimit-remaining-tokens') === null ? null : Number(r.headers.get('x-ratelimit-remaining-tokens')),
      resetMs: parseDuration(r.headers.get('x-ratelimit-reset-tokens')),
    }, Date.now());
    // overloaded ("high demand", 5xx): one retry after a pause, then the caller tries a spare
    if (r.status >= 500 && !retried) {
      this.log.log(`${body.model}: answered ${r.status}, retrying once`);
      await sleep(this.overloadBackoffMs());
      return this.post(body, maxWait, true);
    }
    // daily budget or output cap: waiting a few seconds will not help, so no retry here
    if (r.status === 429 && !retried && !(await this.hopeless(r))) {
      const g = this.provider === 'gemini' ? geminiLimit(await r.clone().text()) : null;
      const wait = Math.max(1000 * Number(r.headers.get('retry-after') ?? 0), parseDuration(r.headers.get('x-ratelimit-reset-tokens')), g?.retryMs ?? 0, 1_000);
      if (wait <= maxWait) {
        this.log.log(`${body.model}: rate limited, retrying in ${Math.round(wait / 1000)} s`);
        await sleep(wait);
        return this.post(body, maxWait, true);
      }
    }
    return r;
  }

  private async hopeless(r: Response): Promise<boolean> {
    const text = await r.clone().text();
    if (this.provider === 'gemini') return geminiLimit(text)?.daily === true;
    return dailyLimit(text) !== null || tooLarge(text);
  }

  async *stream(req: ModelRequest, refused: ReadonlySet<string> = new Set()): AsyncIterable<ModelEvent> {
    const own = this.modelFor(req.agent, req.tool.name);
    const now = Date.now();
    // a model out of daily budget is skipped until Groq says it is back; one that refused this
    // request's size is skipped for this request only
    const model = [own, ...this.sparesFor(req.agent).filter((m) => m !== own)].find((m) => (this.exhausted.get(m) ?? 0) <= now && !refused.has(m));
    if (!model) throw new Error(`${req.agent}: no ${this.provider} model can take this request now (daily budgets or output caps)`);
    const body = toGroqBody(req, model, req.maxTokens ?? 8000, this.effortFor(req.agent, req.tool.name), this.provider);
    const need = Math.ceil(JSON.stringify(body).length / 4) + OUTPUT_GUESS;
    const w = this.window(model);
    const wait = w.waitMs(need, Date.now());
    if (wait > this.maxWaitFor(req.agent)) throw new Error(`${req.agent}: ${this.provider} ${model} quota busy for ${Math.round(wait / 1000)} s`);
    if (wait) { this.log.log(`${req.agent}: waiting ${Math.round(wait / 1000)} s for ${model} quota`); await sleep(wait); }
    w.spend(need);
    if (this.provider === 'gemini') {
      const rw = this.requestWindow(model);
      const rwait = rw.waitMs(Date.now());
      if (rwait > this.maxWaitFor(req.agent)) throw new Error(`${req.agent}: gemini ${model} requests per minute used up for ${Math.round(rwait / 1000)} s`);
      if (rwait) { this.log.log(`${req.agent}: waiting ${Math.round(rwait / 1000)} s for ${model} requests`); await sleep(rwait); }
      rw.spend(Date.now());
    }
    const r = await this.post(body, this.maxWaitFor(req.agent));
    if (r.status === 429) {
      const text = await r.text();
      const g = this.provider === 'gemini' ? geminiLimit(text) : null;
      const back = g ? (g.daily ? g.retryMs : null) : dailyLimit(text);
      if (back !== null) {
        this.exhausted.set(model, Date.now() + back);
        this.log.warn(`${model}: daily ${this.provider === 'gemini' ? 'request quota' : 'token budget'} used up for ${Math.round(back / 60_000)} min; using the next model`);
        yield* this.stream(req, refused);
        return;
      }
      if (tooLarge(text)) {
        this.log.warn(`${model}: ${req.agent} request is above its output cap; using the next model`);
        yield* this.stream(req, new Set([...refused, model]));
        return;
      }
      throw new Error(`${req.agent}: ${this.provider} 429 ${text.slice(0, 300)}`);
    }
    if (r.status >= 500 && [own, ...this.sparesFor(req.agent)].some((m) => m !== model && !refused.has(m) && (this.exhausted.get(m) ?? 0) <= Date.now())) {
      this.log.warn(`${model}: still ${r.status} after a retry; ${req.agent} moves to the next model`);
      yield* this.stream(req, new Set([...refused, model]));
      return;
    }
    if (!r.ok || !r.body) throw new Error(`${req.agent}: ${this.provider} ${r.status} ${(await r.text()).slice(0, 300)}`);
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    const s = new GroqStream();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const ev of s.push(decoder.decode(value, { stream: true }))) yield ev;
      }
    } finally {
      // the consumer stopped early (a cancelled prefetch): close the connection, Groq stops
      reader.cancel().catch(() => undefined);
    }
    const tail = s.end();
    const done = tail.at(-1) as Extract<ModelEvent, { type: 'done' }>;
    if (done.stopReason === 'length') throw new Error(`${req.agent}: ${this.provider} hit max_tokens`);
    // no tool call (a text reply or broken JSON): throw, so FallbackModel answers instead
    const why = s.missingTool();
    if (why) throw new Error(`${req.agent}: ${this.provider} ${model} returned no ${req.tool.name} call (${why})`);
    for (const ev of tail) yield ev;
  }
}
