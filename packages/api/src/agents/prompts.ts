// Prompt text lives in ./prompts/*.md so it can be edited without touching code.
import { readFileSync } from 'node:fs';
import type { LessonPlan } from '@chalk/schema';

const dir = new URL('./prompts/', import.meta.url);
const load = (name: string) => readFileSync(new URL(`${name}.md`, dir), 'utf8').trim();

export const PROMPTS = {
  classroom: load('classroom'),
  boardScript: load('board-script'),
  lead: load('lead-tutor'),
  triage: load('triage'),
  thread: load('thread-tutor'),
  scribe: load('scribe'),
};

/**
 * The cached prefix shared by every agent of a room. It must be byte-identical across calls
 * (no timestamps, no per-call ids), or prompt caching silently stops working.
 */
export function roomPrefix(room: { title: string; goal?: string; syllabus?: string }, plan: LessonPlan | null): string {
  return [
    PROMPTS.classroom,
    PROMPTS.boardScript,
    `# This class\n\nTopic: ${room.title}${room.goal ? `\nGoal: ${room.goal}` : ''}`,
    room.syllabus ? `## Course syllabus\n\n${room.syllabus}` : '',
    plan ? `## Lesson plan\n\n${plan.segments.map((s, i) => `${i}. ${s.title} — ${s.objective}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}
