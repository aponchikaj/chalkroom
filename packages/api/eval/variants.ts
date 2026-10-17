// Prompt / setting variants for the eval runner. `baseline` is production as it is; each other
// variant changes one lever so its effect can be measured on the same cases.
import type { ReasoningEffort } from '../src/agents/groq';
import { PROMPTS } from '../src/agents/prompts';

export interface Variant {
  /** replacements for PROMPTS fields (in memory, this process only) */
  prompts?: Partial<Record<'classroom' | 'boardScript' | 'lead' | 'triage' | 'thread' | 'scribe', string>>;
  /** Groq reasoning effort per agent and tool; undefined = provider default (medium) */
  effort?: (agent: string, tool: string) => ReasoningEffort | undefined;
  /** drop `description` fields from tool input schemas (the prompt already explains Board Script) */
  bareSchemas?: boolean;
}

/** A JSON schema without its description fields. */
export function stripDescriptions(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripDescriptions);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'description').map(([k, x]) => [k, stripDescriptions(x)]));
  return v;
}

export const VARIANTS: Record<string, Variant> = {
  baseline: {},
  /** schema descriptions out: ~2.6k fewer input tokens per Board Script call */
  bare: { bareSchemas: true },
  /** less hidden reasoning on every gpt-oss call */
  low: { effort: () => 'low' },
  lean: { bareSchemas: true, effort: () => 'low' },
  /** thread tutor (qwen): no hidden reasoning, so a reply fits its 1000 output tokens/min */
  threadNone: { effort: (agent) => (agent === 'thread' ? 'none' : undefined) },
  /** triage: the thread rule made explicit and checked first */
  threadFirst: { prompts: { triage: threadFirst(PROMPTS.triage) } },
  threadFirstLow: { prompts: { triage: threadFirst(PROMPTS.triage) }, effort: (agent) => (agent === 'triage' ? 'low' : undefined) },
};

function threadFirst(triage: string): string {
  const from = "Rules for `route` (one entry per cluster you touched; for a new cluster, `cluster` is its exact\n`title` from `assign`):";
  const old = "- `thread`: one asker going deep or off-path, especially their 3rd+ question on one subtopic ->\n  set `user` to the asker's `authorId`. It is only an offer; the learner decides.";
  if (!triage.includes(from) || !triage.includes(old)) throw new Error('triage prompt changed; update the threadFirst variant');
  return triage.replace(`\n${old}`, '').replace(from, `${from}
- \`thread\` first: if \`askerHistory\` has 2+ earlier questions from this asker on the same subtopic,
  route to \`thread\` with \`user\` = their \`authorId\`, even when a short answer exists. It is
  only an offer; the learner decides. Otherwise pick one of:`);
}
