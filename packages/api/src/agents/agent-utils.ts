// Shared agent plumbing: Zod → tool schema, validated calls with one repair pass.
import { z } from 'zod';
import type { ModelPort, ModelRequest, ModelTool } from './model.port';

export function toolFrom(name: string, description: string, schema: z.ZodObject): ModelTool {
  // the Messages API validates tool schemas as JSON Schema draft 2020-12 (tuples → prefixItems)
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12', unrepresentable: 'any' }) as Record<string, unknown>;
  delete json.$schema;
  return { name, description, input_schema: json };
}

const issues = (e: z.ZodError) => e.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');

/**
 * Call the model and validate the tool input. On a Zod error the error goes back to the
 * model for one repair pass (design doc: Failure handling). Throws if still invalid.
 */
export async function callValidated<S extends z.ZodType>(model: ModelPort, req: ModelRequest, schema: S): Promise<z.infer<S>> {
  const first = await model.call(req);
  const r1 = schema.safeParse(first);
  if (r1.success) return r1.data;
  const repair: ModelRequest = {
    ...req,
    messages: [
      ...req.messages,
      { role: 'assistant', content: [{ type: 'tool_use', id: 'repair_1', name: req.tool.name, input: first as Record<string, unknown> }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'repair_1', is_error: true, content: `Invalid input: ${issues(r1.error)}. Call ${req.tool.name} again with the problems fixed.` }] },
    ],
  };
  const second = await model.call(repair);
  const r2 = schema.safeParse(second);
  if (r2.success) return r2.data;
  throw new Error(`${req.agent}: invalid ${req.tool.name} after repair: ${issues(r2.error)}`);
}
