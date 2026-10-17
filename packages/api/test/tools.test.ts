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
