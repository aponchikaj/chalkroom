import { describe, it, expect } from 'vitest';
import { RequestWindow, geminiLimit, toGroqBody } from '../src/agents/groq';

const base = { agent: 'lead', prefix: 'P', system: 'S', messages: [{ role: 'user', content: 'q' }], tool: { name: 'teach_segment', description: 'd', input_schema: {} }, mock: () => null } as never;

describe('Gemini request body (OpenAI-compatible endpoint)', () => {
  it('asks for the one tool with "required" and passes Gemini effort values', () => {
    const b = toGroqBody(base, 'gemini-3.8-flash', 4000, 'low', 'gemini');
    expect(b.tool_choice).toBe('required');
    expect(b.reasoning_effort).toBe('low');
    expect(toGroqBody(base, 'gemini-3.8-flash', 4000, 'minimal', 'gemini').reasoning_effort).toBe('minimal');
    // Groq keeps naming the function
    expect(toGroqBody(base, 'openai/gpt-oss-20b', 4000, 'low').tool_choice).toEqual({ type: 'function', function: { name: 'teach_segment' } });
  });
});

describe('geminiLimit', () => {
  const body = (message: string, details: unknown[] = []) => JSON.stringify([{ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message, details } }]);
  it('reads a per-day quota and its retry delay', () => {
    const b = body('You exceeded your current quota. Quota exceeded for metric: generate_content_free_tier_requests, limit: 20, model: gemini-3.8-flash. Please retry in 41.5s.', [
      { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '41s' },
    ]);
    expect(geminiLimit(b)).toEqual({ daily: true, retryMs: 41_000 });
  });
  it('reads a per-minute quota', () => {
    const b = body('Quota exceeded. Please retry in 7.2s.', [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }]);
    expect(geminiLimit(b)).toEqual({ daily: false, retryMs: 7200 });
  });
  it('also accepts the object form, and returns null for other errors', () => {
    expect(geminiLimit(JSON.stringify({ error: { code: 429, message: 'Resource exhausted. Please retry in 2s.' } }))).toEqual({ daily: false, retryMs: 2000 });
    expect(geminiLimit('not json')).toBeNull();
    expect(geminiLimit(JSON.stringify({ error: { code: 400, message: 'bad' } }))).toBeNull();
  });
});

describe('RequestWindow', () => {
  it('spaces calls to at most `rpm` per rolling minute', () => {
    const w = new RequestWindow(2);
    expect(w.waitMs(0)).toBe(0); w.spend(0);
    expect(w.waitMs(10)).toBe(0); w.spend(10);
    expect(w.waitMs(20)).toBe(60_000 - 20);
    expect(w.waitMs(60_001)).toBe(0);
  });
});

describe('Gemini repair turn', () => {
  it('sends the earlier call and its errors as text (Gemini 3 rejects replayed calls without their thought signature)', () => {
    const repair = {
      ...(base as object),
      messages: [
        { role: 'user', content: 'Call teach_segment.' },
        { role: 'assistant', content: [{ type: 'tool_use', id: 'repair_1', name: 'teach_segment', input: { steps: 'bad' } }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'repair_1', is_error: true, content: 'Invalid input: steps must be an array. Call teach_segment again with the problems fixed.' }] },
      ],
    } as never;
    const b = toGroqBody(repair, 'gemini-3.8-flash', 4000, undefined, 'gemini');
    const msgs = b.messages as { role: string; content: string | null; tool_calls?: unknown }[];
    expect(msgs.some((m) => m.role === 'tool' || m.tool_calls)).toBe(false);
    const all = msgs.map((m) => m.content).join('\n');
    expect(all).toContain('{"steps":"bad"}');
    expect(all).toContain('steps must be an array');
    // Groq keeps the native tool-call turn
    const g = toGroqBody(repair, 'openai/gpt-oss-20b', 4000).messages as { role: string }[];
    expect(g.some((m) => m.role === 'tool')).toBe(true);
  });

  it('counts hidden thinking tokens as output (only total_tokens includes them)', async () => {
    const { GroqStream } = await import('../src/agents/groq');
    const s = new GroqStream();
    s.push('data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{}","name":"triage"},"id":"c","type":"function"}]},"index":0}],"usage":{"completion_tokens":34,"prompt_tokens":107,"total_tokens":300}}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop","index":0}],"usage":{"completion_tokens":34,"prompt_tokens":107,"total_tokens":300}}\n\ndata: [DONE]\n\n');
    const done = s.end().find((e) => e.type === 'done') as { usage: { input: number; output: number } };
    expect(done.usage).toMatchObject({ input: 107, output: 193 });
  });
});

describe('Gemini tool schema', () => {
  it('drops minItems/maxItems (Gemini rejects them; Zod still checks the limits)', () => {
    const withLimits = { ...(base as object), tool: { name: 't', description: 'd', input_schema: { type: 'object', properties: { at: { type: 'array', prefixItems: [{ type: 'number' }, { type: 'number' }], minItems: 2, maxItems: 2 }, steps: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 40 } } } } } as never;
    const g = JSON.stringify(toGroqBody(withLimits, 'gemini-3.8-flash', 100, undefined, 'gemini').tools);
    expect(g).not.toMatch(/minItems|maxItems/);
    expect(g).toContain('prefixItems');
    // the limits stay visible to the model, as words
    expect(g).toContain('At least 1 and at most 40 items');
    expect(JSON.stringify(toGroqBody(withLimits, 'openai/gpt-oss-20b', 100).tools)).toMatch(/minItems/);
  });
});

describe('Gemini overload (503)', () => {
  it('retries once, then moves the request to the next model', async () => {
    const { GroqModel } = await import('../src/agents/groq.model');
    const asked: string[] = [];
    const busy = () => new Response(JSON.stringify([{ error: { code: 503, message: 'This model is currently experiencing high demand.', status: 'UNAVAILABLE' } }]), { status: 503 });
    const ok = () => new Response('data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{}","name":"teach_segment"},"id":"c","type":"function"}]},"index":0}],"usage":{"completion_tokens":1,"prompt_tokens":1,"total_tokens":2}}\n\ndata: [DONE]\n\n', { status: 200 });
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_u: string, init: { body: string }) => { const m = JSON.parse(init.body).model; asked.push(m); return m === 'big' ? busy() : ok(); }) as never;
    try {
      const g = new GroqModel('k', () => 'big', undefined, ['small'], () => 60_000, 'gemini', 100, () => 0);
      let got = false;
      for await (const e of g.stream(base)) if (e.type === 'tool') got = true;
      expect(got).toBe(true);
      expect(asked).toEqual(['big', 'big', 'small']);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('spares per agent', () => {
  it('lets each agent prefer its own kind of spare', async () => {
    const { GroqModel } = await import('../src/agents/groq.model');
    const asked: string[] = [];
    const daily = () => new Response(JSON.stringify([{ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for metric: generate_content_free_tier_requests. Please retry in 60s.', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } }]), { status: 429 });
    const ok = () => new Response('data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{}","name":"teach_segment"},"id":"c","type":"function"}]},"index":0}]}\n\ndata: [DONE]\n\n', { status: 200 });
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_u: string, init: { body: string }) => { const m = JSON.parse(init.body).model; asked.push(m); return m === 'flash-a' ? daily() : ok(); }) as never;
    try {
      const spares = (agent: string) => (agent === 'lead' ? ['flash-b', 'lite'] : ['lite', 'flash-b']);
      const g = new GroqModel('k', () => 'flash-a', undefined, spares, () => 60_000, 'gemini', 100, () => 0);
      for await (const _ of g.stream(base)) { /* drain */ }
      expect(asked).toEqual(['flash-a', 'flash-b']);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
