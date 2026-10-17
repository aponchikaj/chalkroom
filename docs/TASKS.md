# Chalkroom Live: task board

Two developers, two lanes, one contract. **Dev A (frontend lane, web app and design system):
Kote Bibilauri. Dev B (backend + agents lane): Lazare Mirziashvili.** Read `docs/design.md`
first (the product), then `README.md` (how to run it). This file is the board: what is built,
what is next, who does it, and how fast it runs. Backend detail lives in
[`DEVB_TASKS.md`](DEVB_TASKS.md) (what and why) and [`PLANS_DEVB.md`](PLANS_DEVB.md) (how,
step by step); the database in [`SCHEMA.md`](SCHEMA.md).

## Decisions (2026-10-17)

- **Accounts are required.** Email + password (Supabase Auth): register, log in, confirm email,
  reset password. No anonymous join.
- **Profiles and settings:** username, display name, color, bio, profile picture; per-user
  settings (tutor voice on/off and speed, captions, reduced motion, theme, language, email
  notifications).
- **2FA:** authenticator app (TOTP) and email codes.
- **Text only for people.** No microphone, no speech-to-text; only the AI tutor speaks.
- **At most 5 users per room.**
- **RAG:** the tutors cite uploaded files, web pages, the syllabus with past notes and FAQ, and
  the live class transcript.
- **Design:** Dev A owns the web app and the design system; backend work does not wait for it.

## Status at a glance

Done = built and tested. Next = being built. Todo = planned.

| Area | Done | Next / todo | Dev A | Dev B |
|---|---|---|---|---|
| **Platform** | Monorepo, CI, contracts, board engine, local Supabase (Postgres 17), env split local/prod, backend folder structure, sandbox console, e2e + pgTAP + smoke + bench | Deploy (todo) | | B0 done, B7 todo |
| **Accounts and security** | Schema for profiles, settings, 2FA, moderation; signup trigger; `GET /me`; rooms use the profile; `PATCH /me`, settings, profile picture, public profiles, account deletion; email users in every test; `REQUIRE_ACCOUNT` switch | Switch off anonymous sign-in with the web login (next); 2FA API (next) | A8 login, A9 profile and settings, A10 2FA (todo) | B9 done except the switch, B10 done, B11 next |
| **Live class** | Rooms (max 5), join by code, gate (all ready / 60 s / skip), hold, resume, slower, end, checks with spread, reactions, Q&A beat, resume after restart | Presence-aware gate, host handoff (todo) | A4 polish | B5 todo |
| **Questions** | Ask, anonymous +1, rate limit 6/min | Triage: clusters and routes (todo) | A1 rail, A2 ask UX | B2 todo |
| **Threads** | Routes in the contract (501) | Thread service (todo) | A3 drawer | B4 todo |
| **Notes and recap** | `note_blocks` table and broadcast | Scribe summaries, notes, edit route (todo) | A5 | B3 todo |
| **AI tutor** | ModelPort, mock tutor, Claude adapter with fallback, four agents callable | Real model, streaming steps, pipelining (todo, needs `ANTHROPIC_API_KEY`) | | B1 todo |
| **Knowledge (RAG)** | Schema: sources, chunks, hybrid search, resources bucket; `EmbeddingPort` | Ingest, retrieval, citations (todo) | A11 sources panel, citations | B12 todo |
| **Reliability** | Mute/ban columns in the schema | Token budget, simple-mode retry, moderation routes (todo) | buttons | B6 todo |

## Numbers (measured 2026-10-17, local, mock tutor)

**Tests**

| Layer | Command | Count | Covers |
|---|---|---|---|
| Unit | `npm test` | 31 tests, 8 files | pure modules: tool schemas, board, sync, mock tutor, username, settings mapping, mail and embedding adapters |
| API end to end | `npm run test:api` | 67 tests + 11 todo, 7 files | every route: happy path, 400/401/403/404/409/429, RLS, realtime, a full class, accounts, profiles, avatars, settings, mail |
| Database | `npm run test:db` | 39 pgTAP checks, 4 files | signup trigger, usernames, RLS, 2FA rule, bans, settings, deletion cascade, hybrid search |
| Smoke | `npm run smoke` | 1 two-user class | join, stream, check, gate, next segment, end |

**Latency** (`npm run bench`; MacBook, local Docker; p50 / p95 / max in ms)

| Measure | p50 | p95 | max | Note |
|---|---|---|---|---|
| Sign up (Supabase Auth) | 75 | 138 | 138 | email + password |
| `GET /health` | 0 | 2 | 2 | |
| `GET /me` | 4 | 44 | 44 | profile + settings + email |
| `PATCH /me` | 3 | 4 | 4 | |
| `PATCH /me/settings` | 4 | 7 | 7 | |
| `POST /rooms` | 12 | 25 | 25 | room + main stream + host |
| `GET /rooms/code/:code` | 4 | 7 | 7 | |
| `POST /rooms/join` | 9 | 17 | 17 | |
| `POST /rooms/:id/questions` | 7 | 8 | 8 | |
| Start to first board event | 854 | | | mock waits 400 ms per call (plan + teach) |
| Start to the first check | 882 | | | the whole first segment |
| Last ready vote to `check_closed` | 58 | | | gate pass, over realtime |
| Last ready vote to next segment | 75 | | | includes the Q&A beat |

With the real model (B1) the class timings depend on Claude; the target is the first board
shape within about 2 s. Re-run `npm run bench` after each milestone and update this table.

**What it needs to run**

| Need | Detail |
|---|---|
| Node | 20+ (CI and local use 22) |
| Docker | local Supabase, about 3 GB of images on first start |
| Ports | API 3001, web 5173, Supabase 55421 (API) / 55422 (Postgres) / 55423 (Studio) / 55424 (Mailpit) / 55425 (SMTP) |
| Env | `.env` from `npm run env` (local); `.env.local` personal keys; `.env.production.local` hosted Supabase. See `.env.example` |
| Keys (optional until their task) | `ANTHROPIC_API_KEY` (B1), `OTP_SECRET` (B11), `VOYAGE_API_KEY` (B12), hosted service-role key (B7) |
| Production | hosted Supabase (email confirmations on, anonymous off, TOTP on, SMTP), one API instance (the conductor lives in memory), Vercel for the web |

## Lanes and ownership

| | **Dev A (Kote): Frontend** | **Dev B (Lazare): Backend + agents** |
|---|---|---|
| Owns | `packages/web/**` | `packages/api/**`, `supabase/**`, `packages/mock-tutor/**` |
| Shared | `packages/schema/**`: change in a small PR **first**, both review | same |

Rules that keep you out of each other's way:

1. **The contract is `packages/schema/src/live.ts`.** If you need a new event kind, field or
   endpoint, add it there in its own PR, merge it, then build against it. Never send a
   shape that is not in the schema; the API validates every event with Zod before storing.
2. **Only the API writes.** The web reads with RLS and listens on the channel; every learner
   action is a REST call. Do not add client-side inserts. (Supabase Auth calls for signup and
   login, and uploads to a signed Storage URL, are the exceptions.)
3. **New SQL goes in a new migration file** (`supabase migration new <name>`). Never edit a
   migration that is already on `main`.
4. **Mock first.** Every agent has a `mock` answer, so the full class runs with no API key.
   Keep the mock working when you change an agent; it is our demo insurance.
5. Work on your own branch (Dev B: `Lazare`), PR into `main` per milestone, CI must be green.
6. Try routes in the sandbox (http://localhost:3001/sandbox/) before building UI on them.

## Build order (milestones)

Each milestone ends with both halves merged and the demo step working on two laptops.

| # | Milestone | Dev A | Dev B | Demo step |
|---|---|---|---|---|
| M1 | Foundation (done) | | B0 (done) | 1, 2 (join, board draws in sync) |
| M2 | Accounts and questions | A8, A1, A2 | B9 (done, switch pending), B2 | log in, join; 3 (`grouped · 2 asked`) |
| M3 | Threads | A3 | B4 | 4, 7 (thread + catch-up) |
| M4 | Checks, Q&A, wrap-up, profiles | A4, A5, A9 | B3, B5, B10 (done) | 5, 6, 7 (gate passes, credited answer, notes) |
| M5 | Real model, 2FA, RAG, polish | A6, A7, A10, A11 | B1, B11, B12, B6, B7 | rehearsal; mock as backup |

B1 (real model) can start any time; the mock speaks the same contract.

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

### A8 Login, registration, password reset (P0) · API ready (B9)
- Supabase Auth in the browser: `signUp({ email, password, options: { data: { username, display_name, color } } })`,
  `signInWithPassword`, `resetPasswordForEmail` + `updateUser({ password })`, `signOut`.
- Join by link/QR goes through login and back to the room. Rooms take the name and color from
  the profile (send `displayName` only for a per-room nickname).
- When this ships, Dev B turns anonymous sign-in off (`supabase/config.toml`) and sets
  `REQUIRE_ACCOUNT=1`.

### A9 Profile and settings (P1) · API ready (B10)
- `GET /me` (profile, avatar URL, email, settings, 2FA state), `PATCH /me`, `GET /users/:username`.
- Profile picture: `POST /me/avatar/upload-url` -> `storage.from('avatars').uploadToSignedUrl(path, token, file)`
  -> `POST /me/avatar`; `DELETE /me/avatar`. png/jpeg/webp, 2 MiB.
- Settings page: `PATCH /me/settings` (tutor voice and speed, captions, reduced motion, theme,
  language, email notifications); apply them in the player and the theme.
- Delete account: `DELETE /me` (409 while hosting a live room).

### A10 Two-factor authentication (P1) · needs B11
- Authenticator app: `mfa.enroll` (show the QR), `mfa.challenge` + `mfa.verify`.
- Email codes: settings toggle and the second login step (`/me/2fa/...` routes, B11).
- A 401 `{ code: "mfa_required" }` from the API means: show the second-factor step.

### A11 Sources and citations (P1) · needs B12
- Sources panel: upload a file, add a link, see status (`pending`, `ready`, `failed`).
- Citation chips on board shapes with `source: "res:<id>#p<page>"`.

---

## Dev B: Backend and agent tasks

Detail: [`DEVB_TASKS.md`](DEVB_TASKS.md). Steps, code and tests: [`PLANS_DEVB.md`](PLANS_DEVB.md).

| Task | Status | What |
|---|---|---|
| B0 Foundation | done | sandbox, schema for every planned feature, folder structure, mail and embedding ports |
| B9 Accounts | done (switch pending A8) | `GET /me`, rooms use the profile, email users in tests, `REQUIRE_ACCOUNT` |
| B10 Profiles and settings | done | `PATCH /me`, settings, profile picture, public profiles, account deletion |
| B11 Two-factor authentication | next | TOTP enforcement, email codes |
| B2 Triage | todo | clusters and the four routes |
| B4 Threads | todo | open, message, close, share |
| B3 Scribe and notes | todo | summaries, notes, edit route |
| B5 Presence and host handoff | todo | gate counts present learners |
| B1 Real model | todo | Claude, streaming steps, pipelining (needs `ANTHROPIC_API_KEY`) |
| B12 RAG | todo | ingest, retrieval, citations |
| B6 Reliability | todo | budget, retry, moderation routes |
| B7 Deploy | todo | hosted Supabase, API host, Vercel |

## Definition of done for the demo (P0)

- [ ] Register and log in; join by link/QR after login; 5 seats; presence avatars (B9, A8)
- [ ] Lead tutor streams Board Script to a shared board, with the tutor's voice only (B1)
- [ ] Host + ready gates count present learners (A4, B5)
- [ ] Questions -> triage -> clusters + 4 routes (A1, A2, B2)
- [ ] One thread per learner with catch-up (A3, B4, B3)
- [ ] Class checks with answer spread (A4)
- [ ] End-of-class notes (A5, B3)
- [ ] `npm run smoke` and `npm run test:api` green, and a rehearsal with `MODEL=mock`
