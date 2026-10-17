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
  mock: () => null,
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
