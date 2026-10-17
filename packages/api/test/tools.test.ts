import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { LessonPlan, SegmentSummary, TeachSegment, TriageResult } from '@chalk/schema';
import { toolFrom } from '../src/agents/agent-utils';

describe('agent tool schemas', () => {
  it('turn every agent contract into an object JSON Schema the Messages API accepts', () => {
    for (const [name, schema] of [['plan_lesson', LessonPlan], ['teach_segment', TeachSegment], ['triage', TriageResult], ['summarize', SegmentSummary]] as const) {
      const tool = toolFrom(name, 'x', schema as z.ZodObject);
      expect(tool.input_schema.type).toBe('object');
      expect(tool.input_schema.$schema).toBeUndefined();
      // draft 2020-12: tuples must use prefixItems, never the draft-7 array form of items
      expect(JSON.stringify(tool.input_schema)).not.toMatch(/"items":\[/);
    }
  });
});

describe('tool schemas describe inputs', () => {
  it('leave defaulted fields optional (providers validate against this)', async () => {
    const { TeachSegment } = await import('@chalk/schema');
    const tool = toolFrom('teach_segment', 'x', TeachSegment as z.ZodObject);
    const check = (tool.input_schema.properties as Record<string, { required?: string[] }>).check as { required?: string[]; anyOf?: unknown };
    expect(JSON.stringify(check)).not.toMatch(/"required":\[[^\]]*"difficulty"/);
  });
});

describe('teach_segment tool', () => {
  it('requires the end-of-segment check (models skip optional fields)', async () => {
    const { TEACH_TOOL } = await import('../src/agents/lead-tutor.agent');
    expect(TEACH_TOOL.input_schema.required).toContain('check');
  });
});
