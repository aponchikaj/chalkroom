# CLAUDE.md

## Project

**Chalkroom Live**: up to five people join a live class taught by AI tutors on one shared
whiteboard (Hacktoberfest Georgia 2026). Two developers build it in parallel.

- `docs/design.md` is the product source of truth (the hackathon design). `IDEA.md` is the
  earlier analysis of the v1 codebase (`github.com/kotebibo/chalkroom`).
- `docs/TASKS.md` is the task board: what is built, the two lanes (A frontend, B backend),
  milestones. Check it before starting work and tick items off in your PR.
- `README.md` explains how to run everything.
- Team: **Dev A (frontend lane) is Kote Bibilauri**; **Dev B (backend + agents lane) is Lazare
  Mirziashvili** (git user `aponchikaj`). Work in your own lane from `docs/TASKS.md`; changes in
  the other lane go through its owner.

## Architecture rules

- `packages/schema/src/live.ts` is the contract between web and API. Change it first, in its
  own small PR, then build against it. Never send a shape that is not defined there.
- Only the API writes to the database. The web reads with RLS and listens on the private
  channel `room:{id}`; every learner action is a REST call.
- Stream events are append-only with one writer: always go through `EventsService.append`
  (validated with Zod, gap-free `seq` from `append_event()`).
- Agents call models only through `ModelPort`, answer with one validated tool call, and keep
  a working `mock` answer (demo insurance; `MODEL=mock` must always run a full class).
- New SQL goes in a new migration file; never edit a migration that is already on `main`.
- Model: Groq's free tier when `GROQ_API_KEY` is set (lead `openai/gpt-oss-120b`, thread
  `qwen/qwen3.8-27b`, triage/scribe/planning `openai/gpt-oss-20b`), else Claude
  `claude-haiku-4-5` with `ANTHROPIC_API_KEY`, else the mock (design doc, "Model choice").
- Text only for people: no microphone or speech input; only the AI tutor speaks.

## Rules

### 1. Skills first, every prompt

Before each new session, prompt or task, and before writing code or answering:

1. Review every installed skill: user skills (`~/.claude/skills/`), plugin skills and project
   skills. Read each name and description.
2. Analyze the prompt: goal, domain, deliverable, trigger keywords.
3. Select every skill that fits, not only the first match.
4. Load each selected skill with the Skill tool and follow it. When skills conflict, the more
   specific one wins.
5. Start the reply with one line naming them, e.g. `Skills: idea-validation, commit`, or
   `Skills: none matched`.

Apply this to follow-up prompts too, especially when the topic changes.

### 2. Commits and pushes

- **Unsigned when signing is blocked.** If a commit needs a passphrase, token or key to sign,
  make it unsigned for that commit only: `git -c commit.gpgsign=false commit ...`. Keep the
  global git config as it is.
- **Ask for the branch before every push.** Before running `git push`, ask the developer which
  branch to push to, and push only after they answer. Apply this to every push, including
  pushes to `main`.

### 3. Plain text, no emoji

Write everything in plain text: replies, code, comments, UI copy, commit messages, PR bodies
and docs. Say status in words ("done", "failed", "warning"); use SVG icon components (e.g.
`lucide-react`) when the UI needs a visual marker. Emoji (the iOS/Unicode pictograph
characters: check marks, rockets, party poppers, warning signs, pointing hands and the rest)
never appear in any output.
