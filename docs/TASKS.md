# Chalkroom Live: task split

Two developers, two lanes, one contract. Read `docs/design.md` first (the product), then
`README.md` (how to run it). This file says what is already built, who owns what, and the
order to build the rest so the demo works by Sunday 12:00.

## What is already built (the linear part)

Everything that both lanes depend on is in place, so you can start in parallel today.

| Area | Built | Where |
|---|---|---|
| Monorepo | npm workspaces, shared TS config, Vitest, typecheck, CI | root, `.github/workflows/ci.yml` |
| **Contracts** | Stream events, row types, REST bodies, agent tool outputs, realtime topics, presence | `packages/schema/src/live.ts` |
| Board engine | v1 Board Script schema + pure reducer (replay any stream from events) | `packages/board`, `packages/schema/src/core.ts` |
| Database | All core tables, RLS (members read, only the API writes), gap-free `append_event()`, broadcast triggers to `room:{id}`, realtime channel policies, seed course | `supabase/migrations`, `supabase/seed.sql` |
| ModelPort | One interface; mock model; Claude (Haiku 4.5, streaming, forced tool, cached prefix); fallback to the mock on errors | `packages/api/src/agents/*.model.ts` |
| Agents | Lead tutor (plan, teach, answer cluster), triage, thread tutor and scribe are **callable** with validation and a repair pass. Only the lead tutor is wired in. | `packages/api/src/agents` |
| Conductor | Per-room serial actor: lobby → teaching → check → qa → … → ended; ready gate (all ready / 60 s after first vote / host skip); hold, resume, slower, end; check close with spread; Q&A beat for `class` clusters; resume after restart | `packages/api/src/conductor` |
| REST | create, preview, join, leave, start, ready, host, check answer, reactions, ask, +1. Thread routes exist and return 501 | `packages/api/src/{rooms,questions,threads}` |
| Mock tutor | Scripted 3-segment PDA lesson, cluster answers, triage by word overlap, thread replies, summaries | `packages/mock-tutor` |
| Web | Home, pre-join, classroom shell; anonymous auth; private channel + presence; StreamSync (snapshot + buffer + gap fill + resync); board synced on every device with local TTS and captions; people + plan panels; ready bar + host controls; check card with answer spread; lobby with invite link + QR; bare question list | `packages/web/src` |
| Tests | Sync algorithm, contracts vs mock lesson, mock triage, tool JSON schemas; `npm run smoke` runs a two-user class end to end | `packages/*/test`, `scripts/smoke.mjs` |

## Lanes and ownership

| | **Dev A: Frontend** | **Dev B: Backend + agents** |
|---|---|---|
| Owns | `packages/web/**` | `packages/api/**`, `supabase/**`, `packages/mock-tutor/**` |
| Shared | `packages/schema/**`: change in a small PR **first**, both review | same |

Rules that keep you out of each other's way:

1. **The contract is `packages/schema/src/live.ts`.** If you need a new event kind, field or
   endpoint, add it there in its own PR, merge it, then build against it. Never send a
   shape that is not in the schema; the API validates every event with Zod before storing.
2. **Only the API writes.** The web reads with RLS and listens on the channel; every learner
   action is a REST call. Do not add client-side inserts.
3. **New SQL goes in a new migration file** (`supabase migration new <name>`). Never edit a
   migration that is already on `main`.
4. **Mock first.** Every agent has a `mock` answer, so the full class runs with no API key.
   Keep the mock working when you change an agent; it is our demo insurance.
5. Branch per task (`a/question-rail`, `b/triage`), PR into `main`, CI must be green.

## Build order (milestones)

Each milestone ends with both halves merged and the demo step working on two laptops.

| # | Milestone | Dev A | Dev B | Demo step |
|---|---|---|---|---|
| M1 | Foundation (done) | | | 1, 2 (join by QR, board draws in sync) |
| M2 | Questions | A1, A2 | B2 | 3 (`grouped · 2 asked`) |
| M3 | Threads | A3 | B4 | 4, 7 (thread + catch-up) |
| M4 | Checks, Q&A, wrap-up | A4, A5 | B3, B5 | 5, 6, 7 (gate passes, credited answer, notes) |
| M5 | Real model + polish | A6, A7 | B1, B6, B7 | rehearsal; mock as backup |

B1 (real model) can start any time in parallel; it does not block the frontend because the
mock speaks the same contract.

---

## Dev A: Frontend tasks

### A1 Question rail (P0) · needs B2 for real statuses (build against hand-made rows first)
- Replace the bare list in `components/RightPanel.tsx`.
- Group questions by `cluster_id`; one card per cluster titled `clusters.title`, with the
  merged questions listed (design: "Show the merged questions in the card").
- Status chip per `questions.status`: `pending` → "…", `grouped` → `grouped · N asked`
  (`clusters.asker_count`), `later` → `coming up next`, `answered` → the inline
  `clusters.answer`, `thread` → `→ thread`, `flagged` → hidden for others.
- UX rule 2: a question with no status change after ~5 s shows "still sorting…".
- Anonymous +1 button → `api.vote(questionId)` (toggle); show `votes`.
- When an `answer_cluster` event arrives, mark the card "answered in class" and credit
  `askers`.

### A2 Ask UX (P0)
- Text only: people never use a microphone (decision 2026-10-17; `lib/stt.ts` was removed). The
  AI tutor is the only voice.
- Select shapes on the board (`Board` already supports selection) → "Ask about this" →
  `api.ask(roomId, { text, anchor: { streamId: room.main_stream_id, shapeIds } })`.
- Typing indicator via `conn.track({ typing: true })` (presence, not stored).

### A3 Thread drawer (P0) · needs B4
- `components/ThreadDrawer.tsx`: drawer at ~45% width (CSS `.live-body.with-thread` exists).
- Mini board: a second `new Player({ silent: false })` fed by a `StreamSync` for the
  thread's `stream_id` (`fetchEvents` + `useRoomConn().onEvent`). Chat from `chat` events.
- The main board keeps playing as a live picture-in-picture in a corner (render `<Board>`
  of `mainPlayer` small).
- Presence: `conn.track({ threadId })` on open, `null` on close. Others see
  `Nika is in a thread on "bump seeds"` (the People panel already shows a thread icon).
- Thread offer: when a `threads` row for me appears with `status: 'offered'`, show
  "Want to dig into {topic} 1:1?" → `api.openThread(roomId, { threadId })`.
- Back to class → `api.closeThread` → **catch-up card**: `segment_summary` events with
  seq > `thread.left_main_seq`, plus "Replay at 2×" (`mainPlayer.pace = 2`).
- Peek at others' threads read-only; Share to class → `api.shareThread`.

### A4 Checks, gate and Q&A polish (P0)
- `CheckCard`: bar per option from `spread.counts`, "you" marker, collapse to a chip so the
  board stays visible; free-text questions (`short`) show "the tutor will read these".
- Ready bar: excused learners (thread icon) visibly don't block; gate countdown already in TopBar.
- Q&A beat banner while `phase === 'qa'` ("Answering 2 class questions").
- Notices (`notice` events) as toasts instead of lines in the rail.

### A5 Notes and recap (P0 notes, P1 editing)
- Notes tab renders `note_blocks` (Markdown, `components/Markdown.tsx`).
- Editing: one editor per block; add `editing: string | null` to `PresenceState` (schema
  PR), lock the block for others, save with `PUT /rooms/:id/notes/:blockId` (B3).
- Recap screen when `phase === 'ended'` (replace `EndedOverlay`): notes, my questions and
  their answers, proposed cards.

### A6 P1 features
- Confusion heat: "confused" / "got it" (lucide icons) on a selected shape → `api.react`; render counts from `reactions` as
  a glow on the board (`board/Board.tsx`, `PageView`).
- Laser pointer: hold `L` → `conn.sendLaser` throttled to `LIVE.laserHz`; draw others'
  lasers from `conn.onLaser`.
- A "tap to enable the tutor's voice" prompt when browser TTS is blocked (no microphone anywhere).

### A7 Demo polish
- Mobile layout (the phone in the demo), empty and error states, the design pass on Home and
  the lobby, a share card for Discord/Telegram.

---

## Dev B: Backend and agent tasks

### B1 Real model (P0) · start any time
- Put `ANTHROPIC_API_KEY` in `.env`; `/health` shows the model. Run a class and tune
  `agents/prompts/*.md` until segments look good on the board.
- Log `usage` (input/output/cache read) per agent; confirm `cache_read_input_tokens > 0` on
  the second call in a room (the prefix must be byte-stable: see `roomPrefix`).
- **Stream steps as they are written** (UX rule 6): in `LeadTutorAgent.teach`, parse
  `tool_delta` partial JSON and emit each complete step (or each group ending in `say`) as a
  `board` event, validating each step with `BoardStep` first.
- Pipelining: start writing segment n+1 when the check closes so it draws as soon as the
  gate passes (`RoomConductor.teach` TODO).

### B2 Triage wiring (P0)
- `RoomConductor.questionAsked()`: debounce `LIVE.triageDebounceMs`, then run
  `TriageAgent.run` with the new `pending` questions, open clusters (with asker ids) and each
  asker's recent questions. Also run it in `passGate` before the Q&A beat.
- Apply the result in one place: create clusters (`assign.cluster = "new"`, routes refer to
  new clusters by title), set `questions.cluster_id` + `status`, cluster `route`, `reason`,
  `target_segment`, inline `answer`, `asker_count`; `thread` route → offered thread (B4);
  `flag` → `status: 'flagged'`.
- Every question must leave `pending` within ~5 s (UX rule 2); if triage fails, fall back to
  `inline` with "The tutor will answer this in the next Q&A".
- Optional: FAQ lookup before triage (P1).

### B3 Scribe and notes (P0)
- After each `segment_end`: `ScribeAgent.summarize` with the segment's narration
  (`narrationOf` logic) → `segment_summary` event on `main`, push into the conductor's
  `summaries` (thread tutor and lead tutor context, catch-up cards).
- At `end`: final notes into `note_blocks` (one block per segment + key takeaways);
  `PUT /rooms/:id/notes/:blockId` with `Api.editNote` and a version check.
- Clusters answered in class → `faq` rows for the course (P1).

### B4 Threads (P0)
- Implement `threads/threads.controller.ts` (routes and comments are in place) with a
  `ThreadsService`: open (new or accept offered; one open thread per learner is enforced by a
  unique index), message (`chat` learner event → `ThreadTutorAgent.reply` → `chat` tutor
  event + `board` steps on the thread stream), close, share (answered cluster in the rail).
- Context: the room prefix (shared cache), `describeBoard` of the main stream (replay main
  events with `applySteps`), the thread's chat history.
- Set `left_main_seq` on open; call `conductor.membersChanged()` on open/close (open threads
  are already excused from the gate).

### B5 Presence-aware gate and host handoff (P0)
- The gate counts `room_members` with `left_at is null`. Make it count only learners present
  in Supabase Presence: subscribe the API to each live room's channel (service role) or add a
  client heartbeat; mark `left_at` after `LIVE.presenceLeaveMs`.
- Host leaves → pass `host_id` to the longest-present member.

### B6 Reliability (P1)
- Per-room token budget; text-only fallback when Board Script stays invalid after the repair
  pass (post a `notice` + a thread-style `chat`); host mute/kick; abuse flags from triage.

### B7 Deploy (P1, before rehearsal)
- Supabase Cloud project: `supabase link` + `supabase db push`; turn on anonymous sign-ins.
- API on Railway/Fly/Render (one instance; `npm start -w @chalk/api`); web on Vercel/Netlify
  (`npm run build -w @chalk/web`, set the three `VITE_*` vars). Set `WEB_URL` for invite links
  and CORS.

### B8 P1 extras
- Shared PDF: Supabase Storage upload → port `packages/ingest` from v1 → Postgres full-text
  search → `[[res:id#p12]]` citations.

---

## Definition of done for the demo (P0)

- [ ] Anonymous join by link/QR; 5 seats; presence avatars (M1 done)
- [ ] Lead tutor streams Board Script to a shared board (M1 done with mock; B1 real)
- [ ] Host + ready gates (M1 done, basic; A4, B5)
- [ ] Questions → triage → clusters + 4 routes (A1, A2, B2)
- [ ] One thread per learner with catch-up (A3, B4, B3)
- [ ] Class checks with answer spread (M1 done, basic; A4)
- [ ] End-of-class notes (A5, B3)
- [ ] `npm run smoke` green, and a rehearsal with `MODEL=mock`
