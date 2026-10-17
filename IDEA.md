# Chalkroom: the AI Classroom

> Working document. Analysis of `github.com/kotebibo/chalkroom` (v0.1.1) and of where the
> idea could go next. Written 2026-10-17. No code has been changed.

---

## 0. TL;DR

- **The idea:** a classroom where the teacher is an AI model (Claude). People join the class,
  talk to the teacher by voice or text, and the teacher explains on a live whiteboard with
  spoken narration and subtitles. It also quizzes them, writes flashcards, cites their
  textbooks, and remembers what each learner gets wrong.
- **What the repo is today:** a working, tested, **single-learner, local-only** version of
  that classroom. It runs as a Claude Code plugin: your own Claude Code session becomes the
  teacher, and a local web page (`127.0.0.1:4747`) is the classroom. About 6,500 lines of
  TypeScript, 23 MCP tools, 5 skills, 33 passing tests, MIT licence.
- **The gap:** the vision has *many* people in one room. The repo deliberately has
  *one* person and no server (the design doc lists "no multi-user rooms (v1)" as a non-goal).
  Closing that gap is the main strategic decision, because a shared room needs a teacher
  "brain" that the user's own Claude subscription can't legally provide for other people.
- **Recommendation:** keep the local plugin as the open-source core and free funnel. Build
  multi-user in two steps: **(1) "Study group" mode**, where one host shares their local
  classroom with a few friends (cheap, fast, tests demand), then **(2) a hosted classroom**
  running on the Claude API, where one AI teacher's cost is split across the whole room.
- **Verdict:** **TEST MORE.** The product core is strong and unusually well engineered. Demand
  for an *AI-taught group class* is unproven. Run the cheap tests in section 11 before
  building a hosted service.

---

## 1. The vision, in one paragraph

Picture a normal classroom: a board at the front, a teacher talking and drawing, students who
raise their hands, ask questions, answer quick checks and take quizzes. Now replace the human
teacher with an AI. The AI draws diagrams, formulas and code on the board stroke by stroke
while it speaks; subtitles show each sentence; students interrupt with questions by voice or
text; the AI answers, then goes back to the lesson. Afterward everyone gets notes, flashcards
and a progress map. A class can be one person studying alone or a group studying together,
on any topic, grounded in the materials they bring.

**One sentence:** *"A live AI teacher with a whiteboard and a voice, for one learner or a whole
room, on any subject, from your own materials."*

---

## 2. What exists in the repo today

### 2.1 Facts

| | |
|---|---|
| Repo | `github.com/kotebibo/chalkroom` |
| Version | 0.1.1 (3 commits, all on 2026-10-13, author `kotebibo`, org "GeoSafety") |
| Licence | MIT |
| Size | ~6,500 lines of TypeScript/TSX + Markdown skills; `dist/` build is 14 MB and committed |
| Tests | 7 files, **33 tests, all passing**; `tsc` typecheck clean (verified 2026-10-17) |
| Runtime | Node 20+, Claude Code v2.1.80+ (needs the *channels* feature) |
| CI | none (no `.github/`) |

### 2.2 How it works

```
browser UI ──ws──▶ Chalkroom server ──channel event / tool result──▶ your Claude Code session
     ▲                 (MCP, stdio)                                          │
     └────────── board, voice, quiz, cards ◀── MCP tool calls ──────────────┘
                         │
                   course folder (Markdown + JSON, watched for changes)
```

1. You install the plugin in Claude Code and create a course (`chalkroom new "Linear algebra"`).
2. `chalkroom start` opens Claude Code in the course folder with the Chalkroom **channel**.
3. The plugin's MCP server also starts a local web server and opens the classroom in the browser.
4. When you click or speak in the browser, your input is pushed into Claude Code as a channel
   event. Claude replies by calling Chalkroom tools (`board_run`, `speak`, `check_ask`, …),
   which the browser renders.
5. Everything is stored as plain files in the course folder.

**The core principle:** *"The user's session is the brain."* Chalkroom never calls the
Anthropic API, never runs `claude -p`, and never touches credentials. It only gives your
Claude Code session tools and a screen. That's why it costs the developer nothing to run and
why it is single-user.

### 2.3 Feature inventory

| Area | What it does today |
|---|---|
| **Whiteboard** | Own SVG renderer, hand-drawn look (rough.js). Boxes, circles, arrows, text, sticky notes, KaTeX formulas, highlighted code, tables, bar/line charts, paths, frames, groups, Mermaid diagrams. 12 × 8 grid with auto-layout. Animations: highlight, underline, circle, pulse, fade, camera. Pages, pen, eraser, select-and-ask ("explain this part"), SVG/PNG export. |
| **Board Script** | A small JSON scene language Claude writes instead of canvas code. `say` steps block until narration finishes, so drawing and speech stay in sync. |
| **Voice + subtitles** | Browser speech (free, offline) or OpenAI/ElevenLabs with your own key. Sentence-level captions. Push-to-talk (hold Space). Speaking interrupts the tutor. Speed 0.75–2×, mute, text-only. |
| **Lessons** | Plan → 2–4 min segments → inline check → notes. Modes: lecture, Socratic, Feynman, worked example, practice, review, exam prep, ELI5/expert. Resume and replay (every event goes to `events.jsonl`). |
| **Quizzes** | 11 question types. Objective items graded in the browser for free; only free-text goes to Claude (one turn). Misses → flashcards in one click. Placement tests. |
| **Flashcards** | Basic, reverse, cloze. FSRS scheduling (ts-fsrs). Claude proposes, you approve. Reviews never use Claude. CSV import/export. Leech detection. |
| **Resources** | PDF, DOCX, HTML, Markdown, text, code, URLs. Local extraction, BM25 search, citations like `[[res:book#p142]]` that open the page. "Only use my resources" mode. |
| **Learner model** | Per-topic mastery 0–1 with decay, misconception log, prerequisite-aware "next topic", and an **audit log** of every change the tutor makes. |
| **Progress UI** | Knowledge map coloured by mastery, streak, retention, quiz trend, misconceptions, lesson history with replay. |
| **Fallbacks** | Terminal mode if channels are unavailable; `chalkroom serve` for reviews without Claude; a scripted mock tutor for development. |

### 2.4 Code map

| Package | Role |
|---|---|
| `packages/schema` | Zod schemas for every file and wire message; syllabus parser |
| `packages/board` | Board Script reducer and layout, shared by server and browser |
| `packages/server` | MCP tools (`tools.ts`), turn manager (`turns.ts`), web + WebSocket server (`web.ts`), course store, TTS proxy |
| `packages/ingest` | PDF/DOCX/HTML extraction, MiniSearch index |
| `packages/web` | React + Zustand UI: board, player, chat, quiz, cards, review, progress |
| `packages/mock-tutor` | Scripted fake Claude for UI work and tests |
| `packages/cli` | `chalkroom new / start / serve / list / doctor` |
| `skills/chalk-*` | Teaching protocol, Board Script reference, quiz rules, card rules, syllabus building |

### 2.5 What is genuinely clever here

1. **Turn handling around a real platform limit.** Channel events can't interrupt Claude
   mid-turn; they queue. So the server holds new input and hands it back inside the *result of
   Claude's next tool call*. A student's question therefore interrupts the lecture within one
   tool call, not at the end of the turn. This is the hardest problem in the product and it's
   solved well (`packages/server/src/turns.ts`).
2. **Claude only does the thinking.** Reviews, scheduling, playback and objective grading run in
   the browser. A 20-question test costs one turn to create and at most one to grade. This
   keeps usage low, and it matters even more if you ever pay for the API yourself.
3. **Files are the database.** Courses are readable Markdown/JSON. They can be committed to
   git, edited by hand, zipped and shared. That's a good basis for a course marketplace later.
4. **Declarative board.** Claude writes structured Board Script, not canvas code, so drawings
   are validated, replayable, exportable, and the learner can point at shapes by id.
5. **Honesty features.** Citations, resources-only mode, an "I'm not sure" rule, and an audit
   log for the learner model.
6. **Security on localhost.** Binds to 127.0.0.1 and checks Host/Origin on WebSocket upgrades,
   which blocks DNS-rebinding and cross-site attacks from other web pages.

---

## 3. Gap analysis: vision vs. repo

| Vision | Repo today | Gap |
|---|---|---|
| People **join** a classroom | One person, one browser, on their own machine | **Big.** No rooms, identity, invites or network access. |
| **Many users** talk to the teacher | One input queue, no idea who said what | **Big.** Needs per-student identity, turn-taking, a question queue. |
| AI teacher (e.g. Claude) | Yes, via the user's own Claude Code session | Works for one person. Can't serve other people without the API (see §5). |
| Subtitles | Yes, sentence captions | Small: no per-student language, no transcript download. |
| Board | Yes, strong | Small: students can draw, but there's no shared or private student board. |
| "Many many stuff to learn" | Quizzes, cards, modes, resources, progress | Small. Missing group features: polls, leaderboards, breakout pairs. |
| Easy to start | Needs Claude Code, Node, the CLI, a dev flag | **Big** for non-developers. Today only developers can install it. |
| Any language (e.g. Georgian) | `language` per course; browser TTS | **Medium.** Fonts have no Georgian glyphs (see §8). Georgian TTS/STT in browsers is weak or missing. |

The repo is roughly **"the single-player game, done well."** The vision is the
**multiplayer game.**

---

## 4. Product concept for the multi-user classroom

### 4.1 Roles

| Role | Can do |
|---|---|
| **AI Teacher** | Teaches, draws, speaks, asks checks, runs quizzes, answers questions, tracks each student |
| **Host** (human) | Creates the room, picks the course/topic, controls pace, mutes, kicks, approves resources. Optional human "co-teacher". |
| **Student** | Joins by link/code, listens, reads subtitles, raises a hand, asks by voice/text, answers checks, takes quizzes, reviews own cards |
| **Observer** | Watches only (parents, a teacher evaluating the tool, latecomers) |

### 4.2 The room

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Linear algebra · Lesson 4: Eigenvectors     👥 12 in class   ● Live 18:42 │
├───────────┬─────────────────────────────────────────────┬────────────────┤
│ Syllabus  │                                             │ Chat │ Q&A ✋3 │
│ Students  │            SHARED WHITEBOARD                │                │
│  🟢 Nino  │                                             │ Nino: why does │
│  🟢 Luka  │                                             │  λ have to...  │
│  ✋ Ana   │                                             │  ▲ 4 votes     │
│           │ ── "An eigenvector keeps its direction..." ─│                │
├───────────┴─────────────────────────────────────────────┴────────────────┤
│ ✋ Raise hand │ 🎤 Hold to talk │ [ type a question… ] │ My notes │ 🔇 CC │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.3 The hard design problem: one teacher, many voices

With one learner, every input goes to the AI. With twenty, that breaks: the AI would be
interrupted constantly and every question would cost a turn. Rules that fix it:

1. **Question queue, not free interrupts.** Students raise a hand or post to Q&A. Others
   upvote. The teacher takes the top question at the end of each segment (the repo's segment
   loop gives a natural slot for this). The host can let a question in immediately.
2. **Merge similar questions.** Before a Q&A slot, the AI groups questions ("Three of you
   asked why λ can be zero…") and answers them once. One turn, many students served.
3. **Group checks, private answers.** `check_ask` goes to everyone. Each student answers
   privately. Objective answers are graded in the browser (as today). The AI receives a
   **summary** ("14 right, 6 picked B, the common mistake is X") instead of 20 events, and
   re-explains only if the class needs it.
4. **Per-student learner model.** Mastery, misconceptions and cards are kept for each student.
   Class-level stats are computed from them. The AI teaches to the class and adapts to its
   weakest common gaps; personal follow-ups go into each student's review deck.
5. **Private side-tutor (later).** A student can open a private thread ("I'm lost") answered by
   a cheaper model, so the main lecture doesn't stop for one person.
6. **Pace voting.** "Too fast / OK / too slow" buttons replace the single-user
   `slower`/`repeat` controls. The AI gets the vote count.

### 4.4 Session types

| Type | Size | Example |
|---|---|---|
| Solo study (exists) | 1 | Learn Solana from the docs |
| Study group | 2–6 | Friends preparing for the same exam |
| Live class | 10–40 | A course cohort, a school club, a bootcamp |
| Teacher-assisted | any | A human teacher runs the room, the AI does the explaining and grading |
| Async cohort | any | Same course, everyone at their own pace, shared leaderboard and Q&A wall |

### 4.5 Extra learning features worth adding

- **Live polls and mini-games** (fastest correct answer, team quiz).
- **Breakout pairs:** two students explain a concept to each other; the AI listens and critiques
  (an extension of the existing Feynman mode).
- **"Come to the board":** a student draws or writes the answer on the shared board; the AI
  reads it with `board_snapshot` and gives feedback.
- **Shared class notes** built from the lesson, with each student's own annotations.
- **Transcript and subtitles in each student's language** (translation is cheap compared with
  teaching).
- **Homework** with due dates, graded locally where objective.
- **Teacher dashboard:** who struggled with what, exportable.
- **Code playground** for programming courses (already on the roadmap).

---

## 5. The central strategic decision: whose AI pays for the room?

This decides the whole architecture.

The repo's design doc states the constraint: Anthropic does not let third-party developers
offer Claude.ai login or route requests through Free/Pro/Max credentials on users' behalf. So
a *hosted* classroom **cannot** run on students' subscriptions. There are three options:

### Option A: Host's own session, shared over the network ("study group")

One person runs Chalkroom as today. Others join the host's classroom page through a LAN
address or a tunnel. The host's Claude Code session is the teacher.

- **Pros:** reuses about 90% of the code. Zero AI cost to the project. Can ship in weeks.
  Great way to test whether people want to learn *together* with an AI.
- **Cons:** the host must be a developer with Claude Code. One subscription serves several
  people, which may conflict with consumer plan terms if used beyond a few friends sitting
  together; **check Anthropic's usage policy before promoting this.** Opening the server
  beyond 127.0.0.1 removes today's main security guarantee, so it needs auth and invite tokens.
- **Use it for:** validation, not as the business.

### Option B: Hosted classroom on the Claude API (the real product)

Chalkroom runs a server that calls the Claude API directly with its own key. Students just open
a link. The same tools, skills and Board Script are reused; the "brain" moves from Claude Code
to an agent loop on the server (Claude API with tool use, or the Agent SDK).

- **Pros:** anyone can join from a browser. Real accounts, rooms, payments. Works on phones.
- **Cons:** you pay for every token. You need auth, storage, moderation, and privacy
  compliance (minors, GDPR). It's a real company, not a plugin.
- **The key economic insight:** **in a group class, one AI teacher's cost is shared by the
  whole room.** Solo AI tutoring is expensive per learner; a 20-person class divides the cost
  by about 20. This is the strongest argument for the multiplayer idea.

### Option C: Bring your own key

Users paste their own Anthropic API key. It's cheap to run, but only developers will do it.
Keep it as an option inside B, not as the product.

### Rough cost math (Option B)

These are assumptions to check against current pricing, not quotes. The example uses a
Sonnet-class model at $3 per million input tokens and $15 per million output tokens, with
prompt caching (cache reads at about 10% of the input price).

| Item | Assumption |
|---|---|
| Turns per 30-min lesson | ~12 (segments + Q&A slots + check summaries) |
| Context per turn | ~30k tokens, mostly cached (tools, skills, plan, history) |
| New input per turn | ~3k tokens |
| Output per turn | ~2k tokens (Board Script + narration) |

Per turn ≈ 30k × $0.30/M + 3k × $3/M + 2k × $15/M ≈ $0.009 + $0.009 + $0.030 ≈ **$0.05**.
Per lesson ≈ 12 × $0.05 ≈ **$0.60**.

| Class size | AI cost per student per lesson |
|---|---|
| 1 (solo) | ~$0.60 |
| 5 | ~$0.13 (a little more for extra Q&A) |
| 20 | ~$0.04–0.06 |

TTS adds cost if you use paid voices (browser voices are free). Even at 3× these estimates, a
group class at $5–15 per student per month has a healthy margin. Measure real token use with
the mock tutor and a few real lessons before trusting any of this.

### Recommended path

1. **Now:** keep the plugin as the open-source core. Fix the small issues in §8.
2. **Next (validation):** Option A "study group" mode behind a flag, for 2–6 people.
3. **Then (if the tests in §11 pass):** Option B hosted rooms, reusing schema, board, web UI,
   skills and tools. Swap only the brain and the transport.

---

## 6. Architecture sketch for the hosted version

```
 Students' browsers ──WebSocket──▶  Room server (one per live room)
        ▲                            │  room state, roster, Q&A queue, event log
        │                            │  turn manager (extended from turns.ts)
        │                            ▼
        │                       Teacher agent loop ──▶ Claude API (tool use)
        │                            │  same 23 tools + new room tools
        └──── board / speech / ◀─────┘
              checks / quizzes       │
                                     ▼
                     Storage: Postgres (users, rooms, progress)
                              + object storage (resources, course folders, replays)
```

**What carries over almost unchanged:** `packages/schema`, `packages/board`, most of
`packages/web`, the skills (as the system prompt), `packages/ingest`, the FSRS and grading
code, and the mock tutor for tests.

**What changes:**
- Transport: MCP over stdio + channel → server-side agent loop calling the API.
- Turn manager: one held-input queue → a **room queue** with student ids, priorities, votes and
  merging.
- Storage: one folder → multi-tenant storage. Keep the folder format as the export format so
  "you own your course" still holds.
- New tools: `room_poll`, `qa_next`, `class_summary`, `student_followup`, `breakout_start`.
- New envelope types: `hand_raise`, `qa_post`, `qa_vote`, `pace_vote`, `check_summary`,
  `student_join` / `student_leave`.

**Real-time voice option:** for lower latency, the teacher's speech could stream through a
low-latency TTS provider and student speech through a server STT, instead of browser APIs.
That also fixes languages browsers don't support.

---

## 7. Competitive landscape

AI education is crowded. A comparison of 2026 study tools names Kiwi AI, ChatGPT, Claude,
NotebookLM, Gemini, Perplexity, Khanmigo, Quizlet, Copilot and Socratic as the main options
([pasqualepillitteri.it](https://pasqualepillitteri.it/en/news/745/best-ai-apps-for-studying-2026-kiwi-chatgpt-notebooklm)).
One market tracker counts 52 AI-education startups with $2.1B total funding
([neuronfeed](https://neuronfeed.com/category/ai-education)).

| Product | What it does | vs. Chalkroom |
|---|---|---|
| **ChatGPT Study Mode** | Free mode that asks questions and gives hints instead of answers ([dupple](https://dupple.com/learn/best-ai-study-tools)) | Huge reach, but text chat with no live board or lesson structure |
| **NotebookLM** | Turns your notes and readings into flashcards, quizzes, guides and audio overviews, grounded in your sources ([dupple](https://dupple.com/learn/best-ai-study-tools)) | Strongest on "learn from my materials." Not a live, interactive teacher. |
| **Khanmigo** | Safety-first K-12 tutor inside Khan Academy, about $4/month, strong in math ([dupple](https://dupple.com/learn/best-ai-education-tools)) | Owns K-12 trust and curriculum. Hard to beat there; avoid competing head-on. |
| **Claude learning modes** | Socratic behaviour inside Claude | Same brain as Chalkroom, no classroom UI |
| **Learnogram.ai** | Voice-driven AI tutor that teaches on a smart canvas ([betalist](https://betalist.com/startups/learnogram-ai)) | **Closest direct competitor** to the board + voice idea. Study it. |
| **Speak, Praktika, Duolingo Max** | Voice conversation practice for languages | Narrow subject, very polished voice |
| **Synthesia, Sana** | Avatar video for corporate training | Pre-recorded, not interactive |
| **MagicSchool, Brisk** | Copilots that help human teachers | Help the human teacher instead of replacing them. Possible partners. |
| **Zoom / Teams / Meet + AI** | Group calls with AI notes | Have the "room," not the teacher |

The research didn't surface a clear product doing **multiplayer AI-taught live classes**. Read
that with care: it may be a real gap, or a sign that demand is weak. You need to test which.

**Possible positioning:**
- vs. ChatGPT/NotebookLM: *"A teacher, not a chatbot."* It's a live lesson with a board and
  voice that keeps going until you understand.
- vs. Khanmigo: adults and self-learners, any topic, from your own materials.
- vs. Zoom: *"The room comes with a teacher."*

---

## 8. Concrete improvement tips for the current repo

Ordered roughly by value for effort.

### Product and UX

1. **Installation is the biggest barrier.** It needs Claude Code + Node + plugin + CLI +
   a "dangerously" flag. Ideas: a one-line installer, a `chalkroom doctor` that fixes problems
   instead of only listing them, and a 60-second demo video in the README. Apply for the
   channels allowlist early, since the `--dangerously-load-development-channels` flag scares
   people off.
2. **Ship a demo that needs no Claude.** A hosted static page that replays a recorded lesson
   (`events.jsonl` replay already exists) would let anyone see it in 10 seconds. This is the
   best marketing asset you can make cheaply.
3. **Starter courses.** Ship 3–5 polished example courses with resources and syllabi (the
   Solana example is a good start).
4. **Board quality is the product.** Collect 20 real lessons, screenshot the boards, and fix
   the layout problems you see (overlaps, crowding, tiny text). Add more patterns to
   `skills/chalk-board`. A 12 × 8 grid gets crowded fast, so consider auto-paging when it fills.
5. **Transcript export:** a downloadable transcript with board snapshots, built from the
   existing captions and replay data.

### Language and accessibility (important for Georgian users)

6. **Georgian script is not covered by the bundled fonts.** The UI loads Atkinson Hyperlegible,
   Kalam and JetBrains Mono (`packages/web/src/main.tsx`), and none of them includes Georgian
   (Mkhedruli). Georgian text falls back to a system font, so the hand-drawn board look breaks,
   and SVG/PNG export, which embeds only `kalam-latin` (`board/exportBoard.ts`), may render
   Georgian incorrectly. Add a Georgian font (e.g. Noto Sans Georgian or a handwritten-style
   Georgian font) as a fallback in both places.
7. **Georgian voice:** browser speech synthesis and recognition for `ka` are weak or missing on
   most systems. Test this, and plan a server-side TTS/STT provider that supports Georgian.
8. **Translate the UI (i18n)** before targeting non-English learners. It's already on the
   v1.1 roadmap.
9. Speech recognition errors are swallowed silently (`rec.onerror = () => {}` in
   `packages/web/src/lib/stt.ts`). Show the user a message when the mic fails.

### Engineering

10. **Add CI** (GitHub Actions: typecheck + test + build on every PR). There's no `.github/` folder.
11. **Committed `dist/` (14 MB)** causes merge conflicts whenever two collaborators rebuild.
    Build it in CI on release, or at least add a check that `dist/` matches the source.
12. **The design says inputs within 1.5 s are merged into one envelope on the server.** In the
    code, only the browser drops repeated *control* clicks (`Classroom.tsx:153`); the turn
    manager does not merge. Either implement it or update the doc. It matters a lot for
    multi-user.
13. **Multiple browser tabs:** `broadcast()` already sends to every connected client (good for
    multi-user), but `requestSnapshot()` asks the *first* client only, and input has no client
    id. Add a client id to envelopes now. It's cheap, and it's the first step toward rooms.
14. **Measure token usage per lesson** (log tool calls and approximate sizes) so the cost model
    in §5 rests on data.
15. **Evals for teaching quality:** a set of saved lesson prompts where you check the Board
    Script for validity, overlaps, length and citation correctness. The mock tutor and Zod
    schemas make this easy.
16. **Content safety for groups:** once more than one person is in a room, add moderation for
    student messages and a host "mute student" control.

### Docs and repo hygiene

17. Add `CONTRIBUTING.md`, issue templates and a short architecture diagram image.
18. Add screenshots and a GIF to the README; it currently has none.
19. Make "single-user by design (for now)" explicit in the README so people don't expect rooms.

---

## 9. Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **No demand for AI-taught group classes** | People might prefer AI 1-on-1 and humans in groups | Test before building (§11) |
| **Platform dependency** | Channels are a research preview with an allowlist; only approved plugins load without the dev flag ([Claude Code docs](https://code.claude.com/docs/en/channels)) | Terminal mode exists; the hosted version removes the dependency |
| **Subscription terms** | Sharing one Claude subscription with a group could break the terms | Keep Option A small and private; use the API for anything public |
| **Big competitors ship the same thing** | OpenAI/Google/Anthropic could add a board + voice "class" mode | Win on groups, own-materials, open file format, and niches (e.g. Georgian-language learning) |
| **AI cost in solo mode** | ~$0.60 per lesson per learner adds up | Groups split the cost; local grading; cheaper models for side tasks |
| **Hallucinations in front of a class** | A wrong fact taught to 20 people is worse than to 1 | Resources-only mode, citations, a host "flag this" button, post-lesson fact checks |
| **Minors and privacy** | Schools mean children, which brings COPPA/GDPR obligations | Start with adults (university, bootcamps, professionals) |
| **Latency** | A 3–5 s pause before the teacher speaks feels slow in a live class | Sentence-level streaming TTS, short segments, "thinking" animation on the board |

---

## 10. Who it's for: target users, in priority order

1. **Self-learners and developers** (today's users): learning a new technology from its docs.
   They already use Claude Code, so they're the easiest first audience.
2. **University study groups** preparing for the same exam: high motivation, shared material,
   a natural group of 3–6.
3. **Bootcamps and course creators** who want a live, AI-led session for a cohort, at a lower
   cost than a human instructor for every session.
4. **Local-language markets** (e.g. Georgia): there's little good AI teaching content in
   Georgian. The open course format plus Georgian voice support could be a real advantage.
5. **Corporate training** (later): onboarding sessions taught from internal documents.

Avoid K-12 schools at first. It brings long sales cycles, child-safety rules and Khanmigo.

---

## 11. Validation plan (cheap tests before building rooms)

Separate the problem from the solution. The problem: *"Learning alone with AI is lonely and
unstructured, and learning in a group with a human teacher is expensive and slow."* Is that
real?

| # | Test | Cost | Pass signal |
|---|---|---|---|
| 1 | **Watch 5 people use the current solo version** for a 30-min lesson | 1 week | 3 of 5 finish the lesson and want another |
| 2 | **"Wizard of Oz" group class:** one host runs Chalkroom and screen-shares on Zoom/Meet to 4–6 friends; questions go through the host | 1 day | People stay to the end, ask questions, and ask for another session |
| 3 | **Landing page + waitlist** for "AI-taught live study groups," with a demo replay video | 2–3 days | > 10% of visitors join the waitlist from a targeted post (Reddit study communities, local university groups) |
| 4 | **Interview 10 students** (Mom Test: ask about their last exam prep, not about your idea) | 1 week | They describe group study pain without prompting |
| 5 | **Price test:** offer a paid 4-session group course | 1 week | At least a few people pay |

Test 2 is the most important: it needs **no new code** and directly tests the multiplayer idea.

---

## 12. Roadmap proposal

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Polish solo** (2–3 wks) | CI, README with GIF, demo replay page, Georgian font fallback, client ids in envelopes, token logging | A stranger installs it and finishes a lesson unaided |
| **1. Validate groups** (2 wks) | Wizard-of-Oz tests (§11), interviews, waitlist | Clear yes/no on group demand |
| **2. Study group mode** (3–4 wks) | Opt-in LAN/tunnel sharing with invite tokens, roster, raise hand, Q&A queue with votes, group checks with class summary, per-student progress | 5 real groups use it twice each |
| **3. Hosted alpha** (6–10 wks) | API-based teacher loop, accounts, rooms, Postgres + object storage, server TTS/STT, moderation, payments | 50 paying students, cost per lesson measured |
| **4. Growth** | Course marketplace (the file format is already shareable), human co-teacher tools, breakout pairs, mobile review app, more languages | — |

---

## 13. Open questions for the team

1. **Is the goal an open-source tool, a company, or both?** It changes everything in §5.
2. **Who is the first real user?** Developers learning tech, university students, or
   Georgian-language learners?
3. **Is a human ever in charge of the room**, or is the AI the only teacher?
4. **How much should students talk to each other** vs. only to the AI?
5. **Which model and voice stack** for the hosted version, and is low latency or cost more
   important?
6. **Does Anthropic allow Option A** (one host's subscription serving a small group)? Ask
   before building it.

---

## 14. Validation verdict

**TEST MORE.**

**Top 3 reasons:**
1. **The product core is real and good.** Board + voice + checks + spaced repetition + citations
   + an honest learner model, with clean tests. Few competitors combine all of these.
2. **The multiplayer economics are attractive.** One AI teacher's cost is split across the
   room, which makes the group class potentially much cheaper per student than solo AI
   tutoring and far cheaper than human teachers.
3. **Group demand is unproven.** No direct competitor was found doing AI-taught live group
   classes. That could be an opportunity or a sign that people don't want it.

**The #1 risk:** people may want AI 1-on-1 and humans for groups, so the "classroom" part ends
up unused.

**Cheapest next step:** run one **Wizard-of-Oz group class** this week. Screen-share the
current Chalkroom to 4–6 friends on a video call, teach one real topic, and watch whether they
stay, ask questions and want another session. It needs no code.

---

## 15. Naming

The team wants a name that says **multiplayer + classroom + friendly**. Availability below
came from quick DNS/whois lookups on 2026-10-17. Confirm on a registrar and search
trademarks before choosing.

**Top pick: Chalkmates.** "Classmates, with chalk": classroom, people learning together, and a
friendly tone in one word. It keeps "chalk" from the current code, so "Chalkroom" can stay as
the name of a room inside the product ("join a Chalkroom").

| Name | Feel | Domains that looked free | npm / GitHub org |
|---|---|---|---|
| **Chalkmates** | Classmates + board | .ai, .io | both free |
| **Chalkpals** | Warmest, suits younger learners | **.com**, .ai, .io | both free |
| **Chalkcrew** | Team energy | .ai, .io | both free |
| **Classjam** | Casual, like a jam session | .ai, .io | both free |
| **Classroomies** | Funny, memorable | .ai, .io | GitHub name taken |
| **Classlobby** | Game-lobby feel | **.com**, .ai, .io | not checked |
| Chalkroom (current) | Board + room | .ai only | both free |

Taken at every ending checked: Classmates, Deskmates, Homeroom, Lectern, Lyceum, Studyhall,
Openclass, Hallpass, and Dapa (Georgian დაფა, "board").

**Note:** the README says `npm i -g chalkroom`, but the npm package `chalkroom` was not
published on 2026-10-17. Claim the npm name for whatever the final name is.

---

### Sources

- Repo: https://github.com/kotebibo/chalkroom (README, `docs/design.md`, source, tests)
- Claude Code channels docs: https://code.claude.com/docs/en/channels
- 2026 study tool comparison: https://pasqualepillitteri.it/en/news/745/best-ai-apps-for-studying-2026-kiwi-chatgpt-notebooklm
- AI study tools tested: https://dupple.com/learn/best-ai-study-tools
- AI education tools tested: https://dupple.com/learn/best-ai-education-tools
- AI education market notes: https://neuronfeed.com/category/ai-education
- Learnogram.ai: https://betalist.com/startups/learnogram-ai
