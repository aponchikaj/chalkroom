// Drafts a course syllabus from a title and goal with the lead tutor (planner) through ModelPort.
// The answer is Chalkroom checkbox Markdown (parseSyllabus); the mock answer is mockSyllabus.
import { z } from 'zod';
import { parseSyllabus } from '@chalk/schema';
import { mockSyllabus } from '@chalk/mock-tutor';
import type { ModelPort } from '../agents/model.port';
import { callValidated, toolFrom } from '../agents/agent-utils';

const Draft = z.object({ syllabusMd: z.string().min(10).max(20000) });
const draftTool = toolFrom('draft_syllabus', 'Write the course syllabus as Chalkroom checkbox Markdown.', Draft);

const PREFIX = `You are the lead tutor of Chalkroom Live, planning a community course that small groups (up to five people) will take as live classes taught on a shared whiteboard.`;

const SYSTEM = `Write a syllabus for the course in the Chalkroom syllabus format, exactly:

# <course title>

<one sentence: what the learner can do at the end>

- [ ] <topic title>  <!-- id: <short-kebab-id> -->
- [ ] <topic title>  <!-- id: <short-kebab-id>, needs: <earlier-id> -->

Rules: 4 to 8 top-level topics in teaching order, each one live class of about 15 to 30 minutes;
optional subtopics indented by two spaces; ids unique, lowercase kebab-case; plain text, no emoji.
Answer only with the draft_syllabus tool.`;

/** True when the Markdown has at least one topic line parseSyllabus understands. */
export const hasTopics = (md: string) => parseSyllabus(md).topics.length > 0;

export async function draftSyllabus(model: ModelPort, title: string, goal: string): Promise<string> {
  try {
    const out = await callValidated(model, {
      agent: 'lead', prefix: PREFIX, system: SYSTEM, tool: draftTool, maxTokens: 1500,
      messages: [{ role: 'user', content: `Course: "${title}"${goal ? `\nGoal: ${goal}` : ''}\n\nCall draft_syllabus.` }],
      mock: () => ({ syllabusMd: mockSyllabus(title, goal) }),
    }, Draft);
    if (hasTopics(out.syllabusMd)) return out.syllabusMd.trim() + '\n';
  } catch { /* fall through to the scripted outline */ }
  return mockSyllabus(title, goal);
}
