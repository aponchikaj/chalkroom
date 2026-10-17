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
