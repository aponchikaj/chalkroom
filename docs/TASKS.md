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
| **Accounts and security** | Schema for profiles, settings, 2FA, moderation; signup trigger; `GET /me`; rooms use the profile; `PATCH /me`, settings, profile picture, public profiles, account deletion; 2FA: authenticator app enforcement and email codes (`/me/2fa`), gated in the API and in RLS; email users in every test; `REQUIRE_ACCOUNT` switch | Switch off anonymous sign-in with the web login (next) | A8 login, A9 profile and settings, A10 2FA (todo) | B9 done except the switch, B10 done, B11 done |
| **Live class** | Rooms (max 5), join by code, gate (all ready / 60 s / skip), hold, resume, slower, end, checks with spread, reactions, Q&A beat, resume after restart; presence-aware gate (gone after 15 s, back on return), host handoff to the longest-present member; web: classroom in the Acetate Manual design, check card, gate, laser, confusion heat | | A4, A6, A7 done on fixtures | B5 done |
| **Questions** | Ask, anonymous +1, rate limit 6/min; triage: clusters, the four routes, thread offers, every question routed within ~4.5 s; web: question rail and ask bar (text only) | Connect the rail to real statuses (Dev A) | A1, A2 done on fixtures | B2 done |
| **Threads** | Open, accept an offer, message (tutor chat + mini board on the thread stream), close, share as an answered cluster; owners excused at the gate; catch-up from `segment_summary`; web: thread drawer, offer, catch-up | | A3 done on fixtures | B4 done |
| **Notes and recap** | Segment summaries (`segment_summary`), notes at class end (segments, takeaways, class questions), `PUT /rooms/:id/notes/:blockId` with version check, course FAQ; web: notes and recap, one editor per block | | A5 done on fixtures | B3 done |
| **AI tutor** | ModelPort, mock tutor, Claude adapter with fallback, four agents callable | Real model, streaming steps, pipelining (todo, needs `ANTHROPIC_API_KEY`) | | B1 todo |
| **Knowledge (RAG)** | Schema: sources, chunks, hybrid search, resources bucket; `EmbeddingPort` | Ingest, retrieval, citations (todo) | A11 sources panel, citations | B12 todo |
| **Reliability** | Mute/ban columns in the schema | Token budget, simple-mode retry, moderation routes (todo) | buttons | B6 todo |

## Numbers (measured 2026-10-17, local, mock tutor)

**Tests**

| Layer | Command | Count | Covers |
|---|---|---|---|
| Unit | `npm test` | 40 tests, 9 files | pure modules: tool schemas, board, sync, mock tutor, username, settings mapping, email codes, the MFA rule, mail and embedding adapters |
| API end to end | `npm run test:api` | 75 tests + 11 todo, 8 files | every route: happy path, 400/401/403/404/409/429, RLS, realtime, a full class, accounts, profiles, avatars, settings, 2FA (Mailpit codes, TOTP), mail |
| Database | `npm run test:db` | 43 pgTAP checks, 4 files | signup trigger, usernames, RLS, 2FA rule and `mfa_facts()`, bans, settings, deletion cascade, hybrid search |
| Smoke | `npm run smoke` | 1 two-user class | join, stream, check, gate, next segment, end |

**Latency** (`npm run bench`; MacBook, local Docker; p50 / p95 / max in ms)

| Measure | p50 | p95 | max | Note |
|---|---|---|---|---|
| Sign up (Supabase Auth) | 87 | 107 | 107 | email + password |
| `GET /health` | 1 | 5 | 5 | no auth |
| `GET /me` | 7 | 26 | 26 | profile + settings + email; every signed-in route includes the 2FA check (`mfa_facts()`, about 2-3 ms) |
| `PATCH /me` | 5 | 9 | 9 | |
| `PATCH /me/settings` | 6 | 12 | 12 | |
| `POST /rooms` | 15 | 30 | 30 | room + main stream + host |
| `GET /rooms/code/:code` | 5 | 17 | 17 | no auth |
| `POST /rooms/join` | 13 | 28 | 28 | |
| `POST /rooms/:id/questions` | 8 | 10 | 10 | |
| Start to first board event | 841 | | | mock waits 400 ms per call (plan + teach) |
| Start to the first check | 869 | | | the whole first segment |
| Last ready vote to `check_closed` | 64 | | | gate pass, over realtime |
| Last ready vote to next segment | 76 | | | includes the Q&A beat |

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

**Status (branch `a/frontend`):** A1-A7 are built in the "Acetate Manual" visual world
(`DESIGN.md`, `PRODUCT.md`) and work end to end in the dev preview
`/dev/classroom?state=lobby|teaching|check|result|qa|offer|thread|catchup|ended&as=ana|nika|gio|mari`,
which runs on fixtures and a fake API (`packages/web/src/dev/`). Screenshots: `node scripts/shoot.mjs`.
Waiting on Dev B to connect for real: question statuses and clusters (B2), threads endpoints (B4),
`segment_summary` events, note blocks and `PUT /rooms/:id/notes/:blockId` (B3), presence-based
gate (B5). Not done: notices as toasts (the rail shows the latest notices instead).

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

### A10 Two-factor authentication (P1) · API ready (B11)
- Authenticator app: `mfa.enroll` (show the QR), `mfa.challenge` + `mfa.verify`.
- Email codes: `POST /me/2fa/email/send` and `/verify` with `purpose` `enable`, `disable` or `login`;
  `GET /me/2fa` for the state. Codes: 6 digits, 10 minutes, 5 tries, 5 sends per hour.
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
| B11 Two-factor authentication | done | TOTP enforcement (API + RLS), email codes via Mailpit/SMTP |
| B2 Triage | done | clusters and the four routes, thread offers, at every gate |
| B4 Threads | done | open (or accept an offer), message with tutor replies, close, share |
| B3 Scribe and notes | done | segment summaries, notes, edit route with version check, course FAQ |
| B5 Presence and host handoff | done | gate counts present learners (15 s), host handoff on leave or drop |
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
