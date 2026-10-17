# CLAUDE.md

## Project

AI classroom: people join a room, an AI model (e.g. Claude) is the teacher, and it teaches with
a live whiteboard, voice, subtitles, quizzes and flashcards. Working name: **Chalkmates**.

- `IDEA.md` is the source of truth for the concept, architecture options, cost model,
  competitors, roadmap and naming. Read it before planning or building anything.
- The starting codebase is `github.com/kotebibo/chalkroom` (single-user, local-only Claude Code
  plugin). Its `docs/design.md` explains the current architecture.

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
