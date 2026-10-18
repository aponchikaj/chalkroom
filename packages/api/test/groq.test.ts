import { describe, it, expect } from 'vitest';
import type { ModelRequest } from '../src/agents/model.port';
import { GroqStream, toGroqBody } from '../src/agents/groq';

const req = {
  agent: 'lead', prefix: 'PREFIX', system: 'SYSTEM',
  tool: { name: 'teach_segment', description: 'Teach.', input_schema: { type: 'object' } },
  messages: [
    { role: 'user', content: 'Teach segment 0.' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'repair_1', name: 'teach_segment', input: { title: 'x' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'repair_1', is_error: true, content: 'Invalid input: steps: Required.' }] },
  ],
} as unknown as ModelRequest;

describe('toGroqBody', () => {
  it('puts prefix and system first, forces the one tool, and maps the repair pass', () => {
    const b = toGroqBody(req, 'openai/gpt-oss-120b', 8000);
    expect(b.model).toBe('openai/gpt-oss-120b');
    expect(b.stream).toBe(true);
    expect(b.messages[0]).toEqual({ role: 'system', content: 'PREFIX\n\nSYSTEM' });
    expect(b.messages[1]).toEqual({ role: 'user', content: 'Teach segment 0.' });
    expect(b.messages[2]).toEqual({ role: 'assistant', content: null, tool_calls: [{ id: 'repair_1', type: 'function', function: { name: 'teach_segment', arguments: '{"title":"x"}' } }] });
    expect(b.messages[3]).toEqual({ role: 'tool', tool_call_id: 'repair_1', content: 'Invalid input: steps: Required.' });
    expect(b.tools).toEqual([{ type: 'function', function: { name: 'teach_segment', description: 'Teach.', parameters: { type: 'object' } } }]);
    expect(b.tool_choice).toEqual({ type: 'function', function: { name: 'teach_segment' } });
  });
});

describe('GroqStream', () => {
  const chunk = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

  it('turns streamed tool-call fragments into tool_delta events, then the tool and usage', () => {
    const s = new GroqStream();
    const wire = [
      chunk({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'teach_segment', arguments: '{"title":' } }] } }] }),
      chunk({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"PDAs"}' } }] } }] }),
      chunk({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 64 } } }),
      'data: [DONE]\n\n',
    ].join('');
    // fed in awkward pieces, as a network would
    const events = [...s.push(wire.slice(0, 37)), ...s.push(wire.slice(37, 150)), ...s.push(wire.slice(150)), ...s.end()];
    expect(events.filter((e) => e.type === 'tool_delta').map((e) => (e as { partialJson: string }).partialJson).join('')).toBe('{"title":"PDAs"}');
    expect(events.find((e) => e.type === 'tool')).toEqual({ type: 'tool', name: 'teach_segment', input: { title: 'PDAs' } });
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'tool_calls', usage: { input: 36, output: 20, cacheRead: 64, cacheWrite: 0 } });
  });

  it('reads usage from x_groq when the chunk carries it there', () => {
    const s = new GroqStream();
    const events = [...s.push(chunk({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 't', arguments: '{}' } }] }, finish_reason: 'tool_calls' }], x_groq: { usage: { prompt_tokens: 5, completion_tokens: 3 } } })), ...s.end()];
    expect(events.at(-1)).toMatchObject({ usage: { input: 5, output: 3, cacheRead: 0 } });
  });

  it('emits no tool for unparseable arguments, so the caller repairs or falls back', () => {
    const s = new GroqStream();
    const events = [...s.push(chunk({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 't', arguments: '{"broken' } }] }, finish_reason: 'length' }] })), ...s.end()];
    expect(events.some((e) => e.type === 'tool')).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'length' });
  });
});

describe('rate pacing', () => {
  it('parses the reset durations Groq sends', async () => {
    const { parseDuration } = await import('../src/agents/groq');
    expect(parseDuration('36.21s')).toBe(36_210);
    expect(parseDuration('7m12s')).toBe(432_000);
    expect(parseDuration('577ms')).toBe(577);
    expect(parseDuration('1m26.4s')).toBe(86_400);
    expect(parseDuration(null)).toBe(0);
  });

  it('waits only when a call will not fit in the remaining tokens, until the reset', async () => {
    const { RateWindow } = await import('../src/agents/groq');
    const w = new RateWindow();
    expect(w.waitMs(5000, 0)).toBe(0); // nothing known yet
    w.update({ remaining: 3000, resetMs: 20_000 }, 1_000);
    expect(w.waitMs(2000, 1_000)).toBe(0); // fits
    expect(w.waitMs(5000, 1_000)).toBe(20_000); // must wait for the reset
    expect(w.waitMs(5000, 11_000)).toBe(10_000);
    expect(w.waitMs(5000, 21_000)).toBe(0); // reset passed
  });
});

describe('GroqStream without a tool call', () => {
  it('reports it, so the adapter can throw and the fallback answers', async () => {
    const { GroqStream } = await import('../src/agents/groq');
    const s = new GroqStream();
    s.push(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Sure! Here is the lesson...' }, finish_reason: 'stop' }] })}\n\n`);
    const tail = s.end();
    expect(tail.some((e) => e.type === 'tool')).toBe(false);
    expect(s.missingTool()).toBe('finish stop, text: "Sure! Here is the lesson..."');
  });
});

describe('tool_use_failed', () => {
  it('recovers the tool call from failed_generation, so our own Zod validation decides', async () => {
    const { GroqStream } = await import('../src/agents/groq');
    const s = new GroqStream();
    const failed = JSON.stringify({ name: 'teach_segment', arguments: { title: 'Bumps', steps: [{ say: 'hi' }] } });
    s.push(`data: ${JSON.stringify({ error: { message: 'Tool call validation failed', code: 'tool_use_failed', failed_generation: failed } })}\n\n`);
    const tail = s.end();
    expect(tail.find((e) => e.type === 'tool')).toEqual({ type: 'tool', name: 'teach_segment', input: { title: 'Bumps', steps: [{ say: 'hi' }] } });
  });

  it('reports other stream errors', async () => {
    const { GroqStream } = await import('../src/agents/groq');
    const s = new GroqStream();
    s.push(`data: ${JSON.stringify({ error: { message: 'Internal error', code: 'internal' } })}\n\n`);
    s.end();
    expect(s.missingTool()).toContain('Internal error');
  });
});

describe('reasoning effort', () => {
  it('is sent only when set', async () => {
    const { toGroqBody } = await import('../src/agents/groq');
    const base = { agent: 'triage', prefix: 'P', system: 'S', messages: [{ role: 'user', content: 'q' }], tool: { name: 't', description: 'd', input_schema: {} } } as never;
    expect(toGroqBody(base, 'openai/gpt-oss-20b', 100)).not.toHaveProperty('reasoning_effort');
    expect(toGroqBody(base, 'openai/gpt-oss-20b', 100, 'low')).toMatchObject({ reasoning_effort: 'low' });
    // a value the chosen model does not take is dropped (a spare may be another family)
    expect(toGroqBody(base, 'qwen/qwen3.8-27b', 100, 'low')).not.toHaveProperty('reasoning_effort');
    expect(toGroqBody(base, 'qwen/qwen3.8-27b', 100, 'none')).toMatchObject({ reasoning_effort: 'none' });
    expect(toGroqBody(base, 'openai/gpt-oss-120b', 100, 'none')).not.toHaveProperty('reasoning_effort');
  });
});

describe('daily limit', () => {
  it('recognises a tokens-per-day 429 and how long to stay away', async () => {
    const { dailyLimit } = await import('../src/agents/groq');
    const msg = 'Rate limit reached for model `openai/gpt-oss-120b` in organization `org_x` service tier `on_demand` on tokens per day (TPD): Limit 200000, Used 199500, Requested 6301. Please try again in 1h2m7.2s. Need more tokens?';
    expect(dailyLimit(JSON.stringify({ error: { message: msg, type: 'tokens' } }))).toBe(3_727_200);
    expect(dailyLimit(JSON.stringify({ error: { message: 'Rate limit reached ... on tokens per minute (TPM): Limit 8000 ... Please try again in 4.5s.' } }))).toBeNull();
    expect(dailyLimit('not json')).toBeNull();
  });
});

describe('too-large requests', () => {
  it('recognises an output-tokens-per-minute refusal as "try another model"', async () => {
    const { tooLarge } = await import('../src/agents/groq');
    const msg = 'Request too large for model `qwen/qwen3.8-27b` in organization `org_x` service tier `on_demand` on output tokens per minute (OTPM): Limit 1000, Requested 1201. The request\'s expected output tokens exceed the enforced limit';
    expect(tooLarge(JSON.stringify({ error: { message: msg } }))).toBe(true);
    expect(tooLarge(JSON.stringify({ error: { message: 'Rate limit reached ... tokens per minute (TPM) ... try again in 4s' } }))).toBe(false);
    expect(tooLarge('<html>')).toBe(false);
  });
});

describe('GroqModel fallback', () => {
  const tool = { name: 'triage', description: 'd', input_schema: { type: 'object' } };
  const req = { agent: 'lead', prefix: 'P', system: 'S', messages: [{ role: 'user', content: 'q' }], tool } as never;
  const ok = () => new Response('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c","function":{"name":"triage","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n', { status: 200 });
  const refuse = (message: string) => new Response(JSON.stringify({ error: { message } }), { status: 429 });

  it('moves to the next model when one is out of its daily budget or refuses the size, and skips the exhausted one next time', async () => {
    const { GroqModel } = await import('../src/agents/groq.model');
    const asked: string[] = [];
    const replies: Record<string, () => Response> = {
      big: () => refuse('Rate limit reached for model `big` on tokens per day (TPD): Limit 200000, Used 199000, Requested 6000. Please try again in 30m0s.'),
      mid: () => refuse('Request too large for model `mid` on output tokens per minute (OTPM): Limit 1000, Requested 1201.'),
      small: ok,
    };
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_u: string, init: { body: string }) => { const m = JSON.parse(init.body).model; asked.push(m); return replies[m](); }) as never;
    try {
      const g = new GroqModel('k', () => 'big', undefined, ['mid', 'small']);
      for await (const _ of g.stream(req)) { /* drain */ }
      expect(asked).toEqual(['big', 'mid', 'small']);
      asked.length = 0;
      for await (const _ of g.stream(req)) { /* drain */ }
      // big stays skipped for 30 min; mid refused only that one request, so it is asked again
      expect(asked).toEqual(['mid', 'small']);
      expect(g.availableAt('big')).toBeGreaterThan(Date.now() + 29 * 60_000);
      expect(g.availableAt('small')).toBeLessThanOrEqual(Date.now());
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('GroqStream repairs', () => {
  const failed = (gen: unknown) => `data: ${JSON.stringify({ error: { code: 'tool_use_failed', message: 'tool call validation failed: /steps: expected array, but got string', failed_generation: typeof gen === 'string' ? gen : JSON.stringify(gen) } })}\n\n`;

  it('unwraps array and object fields the model sent as JSON strings', async () => {
    const { GroqStream } = await import('../src/agents/groq');
    const s = new GroqStream();
    s.push(failed({ name: 'reply', arguments: { markdown: 'Bump starts at 255.', steps: '[{"say":"hi"}]', note: '[not json' } }));
    const tool = s.end().find((e) => e.type === 'tool') as { input: Record<string, unknown> };
    expect(tool.input.steps).toEqual([{ say: 'hi' }]);
    expect(tool.input.note).toBe('[not json');
    expect(tool.input.markdown).toBe('Bump starts at 255.');
  });

  it('reads a tool call written in the XML form (qwen)', async () => {
    const { GroqStream } = await import('../src/agents/groq');
    const s = new GroqStream();
    s.push(failed('<tool_call>\n<function=reply>\n<parameter=markdown>\nIt runs **x first**.\n</parameter>\n<parameter=steps>\n[{"say":"Outer loop first."}]\n</parameter>\n</function>\n</tool_call>'));
    const tool = s.end().find((e) => e.type === 'tool') as { name: string; input: Record<string, unknown> };
    expect(tool.name).toBe('reply');
    expect(tool.input).toEqual({ markdown: 'It runs **x first**.', steps: [{ say: 'Outer loop first.' }] });
  });

  it('keeps a sample of a generation it cannot parse, for the log', async () => {
    const { GroqStream } = await import('../src/agents/groq');
    const s = new GroqStream();
    s.push(failed('<tool_call>reply {broken'));
    s.end();
    expect(s.missingTool()).toContain('<tool_call>reply {broken');
  });
});
