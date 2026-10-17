import { describe, it, expect } from 'vitest';
import { toAnthropicParams } from '../src/agents/anthropic.params';

const req = (agent: string, maxTokens?: number) => ({
  agent, prefix: 'PREFIX', system: 'SYS', messages: [{ role: 'user', content: 'q' }],
  tool: { name: 'teach_segment', description: 'd', input_schema: { type: 'object' } }, maxTokens, mock: () => null,
}) as never;

describe('toAnthropicParams (Claude Sonnet 5.5)', () => {
  it('never forces the tool (Sonnet 5.5 rejects forced tool_choice) and says which tool to call', () => {
    const p = toAnthropicParams(req('lead'), 'claude-sonnet-5-5');
    expect(p.tool_choice).toEqual({ type: 'auto' });
    expect(JSON.stringify(p.system)).toContain('teach_segment');
    expect(p.tools).toHaveLength(1);
  });

  it('caches the shared prefix, keeps thinking on and sets effort per agent', () => {
    const lead = toAnthropicParams(req('lead'), 'claude-sonnet-5-5');
    const triage = toAnthropicParams(req('triage'), 'claude-sonnet-5-5');
    expect((lead.system as { cache_control?: unknown }[])[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(lead).not.toHaveProperty('thinking'); // adaptive by default; "disabled" is a 400
    expect(lead.output_config).toEqual({ effort: 'medium' });
    expect(triage.output_config).toEqual({ effort: 'low' });
  });

  it('leaves room for thinking in max_tokens', () => {
    expect(toAnthropicParams(req('lead', 8000), 'claude-sonnet-5-5').max_tokens).toBeGreaterThanOrEqual(16000);
  });

  it('opts into server-side refusal fallback', () => {
    const p = toAnthropicParams(req('lead'), 'claude-sonnet-5-5');
    expect(p.fallbacks).toBe('default');
    expect(p.betas).toContain('server-side-fallback-2026-07-01');
  });
});
