// ModelPort: the one door to a language model. Agents never import a provider SDK directly,
// so the mock, Claude and any fallback provider are interchangeable.
import type Anthropic from '@anthropic-ai/sdk';

export type AgentName = 'lead' | 'thread' | 'triage' | 'scribe';

export interface ModelTool {
  name: string;
  description: string;
  /** JSON Schema of the tool input (object) */
  input_schema: Record<string, unknown>;
}

export interface Usage { input: number; output: number; cacheRead: number; cacheWrite: number }

export interface ModelRequest {
  agent: AgentName;
  /** room the call is for: usage metering and the per-room budget (B6) */
  roomId?: string;
  /**
   * Stable text shared by every agent in a room (system rules + Board Script + lesson plan).
   * Sent first with cache_control so lead, thread and triage calls reuse one cached prefix.
   */
  prefix: string;
  /** Agent-specific instructions, after the cached prefix. */
  system: string;
  messages: Anthropic.MessageParam[];
  /** The agent must answer with exactly this tool. */
  tool: ModelTool;
  maxTokens?: number;
  /** Canned tool input for MockModel (demo insurance). Every agent provides one. */
  mock: () => unknown;
}

export type ModelEvent =
  | { type: 'text'; text: string }
  /** partial JSON of the tool input as the model writes it (for streaming board steps) */
  | { type: 'tool_delta'; partialJson: string }
  | { type: 'tool'; name: string; input: unknown }
  | { type: 'done'; stopReason: string | null; usage?: Usage };

export abstract class ModelPort {
  abstract readonly name: string;
  abstract stream(req: ModelRequest): AsyncIterable<ModelEvent>;

  /** Run a request to completion and return the tool input. */
  async call(req: ModelRequest): Promise<unknown> {
    let input: unknown;
    for await (const e of this.stream(req)) if (e.type === 'tool') input = e.input;
    if (input === undefined) throw new Error(`${this.name}: ${req.agent} returned no ${req.tool.name} call`);
    return input;
  }
}
