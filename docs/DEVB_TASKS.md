# Dev B tasks: backend and agents (Lazare Mirziashvili)

Every Dev B task from `docs/TASKS.md`, expanded: what exists today, what to build, the design
decisions, the traps found while reading the code, and how to know it is done. The step-by-step
implementation (files, code, tests, commands) is in [`PLANS_DEVB.md`](PLANS_DEVB.md).

Read first: `docs/design.md` (product), `docs/TASKS.md` (lanes and milestones), `CLAUDE.md`
(architecture rules). Dev B owns `packages/api/**`, `supabase/**`, `packages/mock-tutor/**`.
`packages/schema/**` is shared: change it first, in its own small PR, reviewed by Dev A.

## Decisions (2026-10-17)

| Topic | Decision | Effect on the backend |
|---|---|---|
| Frontend and design | Dev A (Kote) owns the web app and the design system | Backend work never waits for design; contracts and the sandbox are how we test |
| Accounts | **Required.** Email + password (Supabase Auth): registration, login, email confirmation, password reset | Anonymous join goes away (B9). The demo joins by QR, then a quick login |
| Profiles | Username, display name, color, bio, profile picture | B10: profile API, avatars bucket |
| 2FA | Authenticator app (TOTP) **and** email codes | B11: Supabase MFA for TOTP, our own email-code flow |
| RAG | Uploaded files, web pages, syllabus + past notes and FAQ, live class transcript | B12 replaces the old B8 (PDF only) |
| Voice | **Text only for people.** No microphone, no speech-to-text, no calls with audio; only the AI tutor speaks (browser TTS of its `say` steps) | Nothing to build server-side; `packages/web/src/lib/stt.ts` removed; agents never expect spoken input |
| Settings | Users have settings (tutor voice, captions, motion, theme, language, notifications) | B10: `user_settings` table and `GET/PATCH /me/settings` |
| Room size | **5 users maximum** per room | Already enforced: `rooms.seats` check, `LIVE.maxSeats`, join returns 409; tested in e2e and pgTAP |

The anonymous-join demo in `docs/design.md` ("join by QR, the avatars pop in") now means
"scan, log in, join". `docs/design.md` should be updated to match (product owner: Lazare).

## Order and milestones

| Order | Task | Priority | Milestone | Unblocks Dev A | Size |
|---|---|---|---|---|---|
| 0 | B0 Foundation: sandbox, schema, folder structure | done | | testing every route | |
| 1 | B2 Triage wiring | P0, **done** | M2 Questions | A1 question rail statuses | M |
| 2 | B9 Accounts (email + password, accounts required) | P0, **done** (anonymous switch-off waits for A8) | M2 | login, register, reset screens | M |
| 3 | B4 Threads | P0, **done** | M3 Threads | A3 thread drawer | M |
| 4 | B3 Scribe and notes | P0, **done** | M4 Wrap-up | A3 catch-up card, A5 notes | M |
| 5 | B5 Presence gate and host handoff | P0, **done** | M4 Wrap-up | A4 ready bar | M |
| 6 | B10 Profiles, avatars and settings | P1, **done** | M4 | profile page, avatar picker, settings | M |
| 7 | B1 Real model | P0, **done** (Groq free tier) | M5 Polish | nothing (mock speaks the same contract) | M |
| 8 | B11 Two-factor authentication | P1, **done** | M5 | 2FA settings and login step | M |
| 9 | B12 RAG | P1, **done** | M5 | sources panel, citations | L |
| 10 | B6 Reliability | P1, **done** | M5 Polish | host mute/kick buttons | M |
| 11 | B7 Deploy | P1, **prepared** (needs hosted keys) | M5, before rehearsal | the demo itself | S |
| 12 | Class deck: scribe `propose_cards` at end of class, `POST /cards/:id/review` (FSRS via ts-fsrs) | P1, **done** | M4 Wrap-up | deck and review screens | S |

B1 can start any time once an `ANTHROPIC_API_KEY` exists. B9 comes early because "accounts
required" changes how every test and the web sign in; ship it together with Dev A's login
screens.

## Working rules for every task

- **Branch:** commit on `Lazare`; open a PR `Lazare` to `main` at the end of each milestone
  (CI green). Ask before every push (CLAUDE.md rule 2).
- **Local stack:** `npm run db:start`, `npm run env`, `npm run dev`. Local Supabase runs
  Postgres 17 in Docker; production is the hosted project (`.env.production.local`).
- **Gate before each commit:** `npm run typecheck`, `npm test`, `npm run test:api` (e2e
  against the local stack), `npm run test:db` (pgTAP) when SQL changed, and with the API
  running, `npm run smoke` (mock tutor, two users, full class).
- **Try it by hand:** http://localhost:3001/sandbox/ (dev console) or
  `packages/api/sandbox/api.http`. Add every new route to both (see `packages/api/README.md`).
- **Mock first:** every agent keeps a working `mock` answer; `MODEL=mock` must always run a full
  class.
- **One writer:** stream events only through `EventsService.append`; rows only from the API.
- **Contract:** never send a shape not in `packages/schema/src/live.ts`. B6 (moderation), B9 and
  B10 (profiles), B11 (2FA) and B12 (sources) need contract changes; each goes first, in its
  own PR. The database is already ahead of the contract (see `docs/SCHEMA.md`).
- **Schema:** the migrations for B6, B9-B12 exist and are tested
  (`supabase/migrations/20261017171339..171347`). A task that needs more SQL adds a new
  migration; never edit one already on `main`.
- **Pure core, thin services:** put decision logic in pure functions (no DB, no `config`
  import) so Vitest can test them; services only read, call the pure function, and write.
  Importing `packages/api/src/config.ts` in a test throws (it requires env vars).

---

## B0 Foundation (done)

- **Sandbox:** dev console at http://localhost:3001/sandbox/ (several users, every route, live
  room feed), `npm run test:api` (e2e, 42 tests), `packages/api/sandbox/api.http` with
  `npm run sandbox:tokens`.
- **Schema:** accounts and profiles, moderation, 2FA, RAG migrations plus pgTAP tests
  (`npm run test:db`, 32 tests). Map: `docs/SCHEMA.md`.
- **Folder structure:** feature folders in `packages/api/src`, each planned one with a
  `README.md` naming its files; `MailPort` (SMTP to Mailpit locally, console fallback) and
  `EmbeddingPort` (no-embeddings default) built; the `REQUIRE_ACCOUNT` switch in `AuthGuard`.
  Map: `packages/api/README.md`.

---

## B2 Triage wiring (P0)

**Goal:** every question leaves `pending` within about 5 s (UX rule 2): it is grouped into a
cluster and routed to `class`, `later`, `inline` or `thread`; abuse is flagged.

**Today:**
- `POST /rooms/:id/questions` inserts the row as `pending` and calls
  `RoomConductor.questionAsked()`, which does nothing (`room-conductor.ts:54`,
  `questions.controller.ts:34`).
- `TriageAgent.run` is callable and validated; `mockTriage` clusters by word overlap
  (`packages/mock-tutor/src/index.ts:122`).
- `qaBeat` already answers clusters with `route = 'class'` and `answered = false`.

**Build:**
1. A `TriageService` with its own per-room lane (timer + promise chain), separate from the
   conductor queue.
2. A pure `planTriage(result, questions, clusters)` that turns the agent's tool call into
   cluster writes, question writes and thread offers.
3. Apply in one place: insert new clusters, update touched clusters (`route`, `reason`,
   `target_segment`, `answer`, `asker_count`), then set each question's `cluster_id` and
   `status`.
4. `thread` route: create an offered thread (`threads.status = 'offered'`, own stream) for the
   asker through a small `ThreadStore` (B4 reuses it).
5. `passGate` runs triage once more and waits for it, before the Q&A beat.
6. Resumed rooms after an API restart re-run triage for leftover `pending` questions.

**Decisions and traps:**
- **Do not run triage on the conductor queue.** `teach()` runs inside the queue for the whole
  segment, so a queued triage would wait 30 s or more and break the 5 s rule. Triage gets its
  own lane; the gate awaits that lane, which cannot deadlock because triage never enqueues on
  the conductor.
- **Batch window, not a pure debounce.** A debounce "4 s after the last question" can starve
  triage while questions keep arriving. Fire `LIVE.triageDebounceMs` (4 s) after the first
  pending question of a batch; later questions join the same batch.
- **Status per route:** `class` to `grouped`, `later` to `later`, `inline` to `answered`,
  `thread` to `thread`, flagged to `flagged` (no cluster).
- **New clusters are referenced by title** in `route[]` (see `TriageResult` docs). Match on a
  normalized key `new:<lowercased trimmed title>`.
- **Nothing stays pending.** A question the model forgot, a cluster with no route, an inline
  route with no answer, or a failed agent call all fall back to `inline` with the answer
  "The tutor will answer this in the next Q&A."
- **Only update rows still `pending`** (`.eq('status', 'pending')`) so a late run never
  overwrites a newer state.
- Write cluster rows before question rows so the web receives the cluster first.
- One offer per learner at a time: skip the offer if they already have an `offered` or `open`
  thread.

**Acceptance criteria:**
- Two learners ask the same thing in different words: one cluster, `route = 'class'`,
  `asker_count = 2`, both questions `grouped`, then an `answer_cluster` event crediting both
  in the Q&A beat.
- A single short question ends `answered` with an inline answer.
- If the agent throws, every pending question still ends `answered` with the fallback text.

**Verify:** unit tests for `planTriage`; smoke asserts the grouped cluster and the
`answer_cluster` event with both askers.

**Coordinate with Dev A:** A1 renders `questions.status` and `clusters.*`; no contract change.

---

## B4 Threads (P0)

**Goal:** one personal side tutor per learner, on its own stream and mini board, while the
class continues; the learner is excused from the gate.

**Today:** routes exist and return 501 (`threads/threads.controller.ts`). `ThreadTutorAgent.reply`
is callable. The DB has `threads` with a partial unique index (one `open` thread per learner per
room) and the gate already excuses owners of `open` threads (`room-conductor.ts:115`).

**Build (`ThreadsService`):**
- **open** `POST /rooms/:id/threads` (`Api.openThread`): accept an offered thread
  (`threadId`), or create a new one from `topic` or `questionId`. Set `status = 'open'` and
  `left_main_seq` = the main stream's `last_seq`. Post a short tutor greeting as a `chat`
  event. Mark the linked question `thread`. Call `conductor.membersChanged()`.
- **message** `POST /threads/:id/messages`: owner only, thread open. Append the learner `chat`
  event, return 202, then reply in the background on a per-thread lane: `chat` (tutor) plus an
  optional `board` event on the thread stream.
- **close** `POST /threads/:id/close`: owner only; `status = 'closed'`; `membersChanged()`.
  Closing an offered thread is how a learner declines it.
- **share** `POST /threads/:id/share`: owner only; insert an answered cluster
  (`route = 'inline'`, `answer` = the given markdown or the last tutor reply) and store
  `threads.shared_answer`.

**Context for the thread tutor:** the room prefix (same bytes as the lead tutor, from
`RoomsService.prefixOf`), `describeBoard` of the main board (replay main `board` and
`answer_cluster` steps through `applySteps`), the thread's chat history as alternating
user/assistant messages.

**Decisions and traps:**
- The reply can take seconds: do not hold the HTTP request; the client sees the reply as
  events. Serialize replies per thread so two quick messages answer in order.
- History must not contain the message being answered twice: build it from chat events with
  `seq` lower than the learner event just appended (`ThreadTutorAgent.reply` adds the text
  itself).
- The Messages API needs the first message to be `user`: drop leading tutor lines (the
  greeting) and merge consecutive same-role lines.
- Unique index violation (`23505`) on open means "you already have an open thread": return 409.
- If the agent fails, post a tutor `chat` line "I could not answer that just now. Try asking
  again in a moment." instead of leaving the learner waiting.
- Peek is free: RLS lets every member read every stream of the room.

**Acceptance criteria:**
- A learner opens a thread, sends a message, and receives a tutor `chat` event (and board steps
  when given) on the thread's stream.
- While the thread is open, the gate passes when everyone else is ready.
- A second open returns 409; a stranger cannot message, close or share another learner's thread
  (403).

**Verify:** unit tests for `chatHistory` and `boardOf`; smoke opens a thread, gets a reply,
passes the gate without the thread owner, then closes it.

**Coordinate with Dev A:** A3 needs a shared cluster with no questions to still show in the rail
(shared answers have no `questions` rows). Agree on this before merging share.

---

## B3 Scribe and notes (P0)

**Goal:** a 3-line summary after every segment (catch-up cards, lead and thread context) and
shared notes at the end of class; FAQ entries for course rooms (P1).

**Today:** `ScribeAgent.summarize` is callable; the conductor has TODOs at `room-conductor.ts:103`
(summary) and `:195` (notes). `note_blocks` exists and broadcasts. `Api.editNote` exists in the
contract but there is no `PUT` route.

**Build:**
- After `segment_end`: start the summary **without blocking** the move to `check`. Transcript =
  the segment's `say` lines plus its check prompt (pure `segmentTranscript`), plus the questions
  asked during the segment. Append `segment_summary { segment, title, summary }` on `main` and
  push into the conductor's `summaries`.
- Before teaching the next segment, await the pending summary so the lead tutor sees it.
- At `end`: await the last summary, build notes with a pure `buildNotes` (one block per segment,
  "Key takeaways" from check results, "Questions from class" from answered clusters) and insert
  `note_blocks` rows `idx 0..n`.
- `qaBeat` stores the spoken answer text in `clusters.answer`, so notes and FAQ have text.
- `PUT /rooms/:id/notes/:blockId` (`Api.editNote`): member only, optimistic version check
  (`version = body.version` or 409), bumps `version`, sets `edited_by`.
- FAQ (P1): for rooms with a `course_id`, insert one `faq` row per answered cluster.
- Recovery: rebuild `summaries` from `segment_summary` events after a restart.

**Decisions and traps:**
- The check closes at the gate, after `segment_end`, so the summary cannot include the check
  result. The notes' takeaways read results from `check` and `check_closed` events instead.
- Notes come from data, not a second model call: cheaper, mock-safe, and accurate.
- A scribe failure must never break the class: catch and log; the summary is optional.

**Acceptance criteria:**
- Every finished segment gets one `segment_summary` event.
- Ending the class creates note blocks visible to all members.
- Two members editing one block: the second save gets 409.

**Verify:** unit tests for `segmentTranscript`, `checkResults`, `buildNotes`; smoke asserts a
`segment_summary` event and `note_blocks` rows after end.

**Coordinate with Dev A:** A3 catch-up reads `segment_summary` with `seq > left_main_seq`; A5
renders and edits `note_blocks`.

---

## B5 Presence-aware gate and host handoff (P0)

**Goal:** the gate counts only learners who are actually here; a dropped learner stops
blocking after 15 s; if the host leaves, the longest-present member becomes host.

**Today:** the gate counts `room_members` with `left_at is null` (`room-conductor.ts:119`).
Clients track Presence on `room:{id}` with key = `userId` (`web/src/room/connection.ts:88`).
`leave` sets `left_at`; nothing marks a dropped tab.

**Build:**
- `PresenceService`: subscribe the API (service role) to each watched room's private channel,
  read `presenceState()` keys, and every sync plus every 5 s run a pure `PresenceTracker`:
  members absent for `LIVE.presenceLeaveMs` get `left_at = now`; a member who reappears gets
  `left_at = null`. Then `membersChanged()`.
- Watch a room when its conductor is created (join, start, recover); stop when it has ended.
- Host handoff in `RoomsService.handOffHost`: if the host is no longer active, the active member
  with the earliest `joined_at` becomes host (`rooms.host_id` and `room_members.role`), plus a
  `notice`. Run it from presence leaves and from `POST /rooms/:id/leave`.

**Decisions and traps:**
- **Spike first:** confirm the service-role client can join a private channel and read
  presence. Fallback if not: a client heartbeat endpoint (needs a contract PR).
- Start counting only after the channel reports `SUBSCRIBED`, or an empty first state marks
  everyone absent.
- The gate itself does not change: it already counts `left_at is null`, which presence now
  maintains.
- **The smoke test must track presence**, or after 15 s the API marks both smoke users absent
  and the gate never passes.
- Avoid a constructor cycle: `ConductorService` registers a callback on `PresenceService`.

**Acceptance criteria:**
- Close one learner's tab: within about 20 s their `left_at` is set and the gate passes without
  them; reopening clears it.
- The host closes their tab: within about 20 s another member gets the host controls.

**Verify:** unit tests for `PresenceTracker` and `pickSuccessor`; smoke tracks presence and
checks host handoff through `leave`; manual two-browser check for the tab-close case.

---

## B1 Real model (P0)

**Goal:** Claude Haiku 4.5 (`claude-haiku-4-5`) runs all four agents well, streams board steps
as they are written, and stays cheap.

**Today:** `AnthropicModel` streams with one forced tool and `cache_control` on the room prefix;
`FallbackModel` falls back to the mock. `LeadTutorAgent.teach` waits for the whole tool call
and then yields it in chunks (`lead-tutor.agent.ts:40`).

**Build:**
1. Put the key in `.env.local` (`ANTHROPIC_API_KEY=...`); `/health` shows
   `model: "anthropic"`.
2. Usage metering: a `MeteredModel` wrapper and `UsageMeter` log per agent and room: input,
   output, cache read, cache write. Agents pass `roomId` on every `ModelRequest`.
3. Streaming steps: a pure `StepStreamer` pulls each complete element of the top-level `steps`
   array out of the partial JSON; `streamTeach` validates each with `BoardStep` and yields
   groups ending in `say`; the final tool input is still validated in full and fills any gap.
4. Fix `FallbackModel`: count `tool_delta` as "produced", or a mid-stream failure replays the
   whole mock segment on top of steps already drawn.
5. Pipelining: when a segment ends, start writing the next one into a buffer; at the gate,
   replay the buffer (still streaming if unfinished). Discard it if the host pressed Slower or
   fewer than half got the check right.
6. Prompt tuning: run full classes and edit `agents/prompts/*.md` until boards look good.

**Decisions and traps:**
- **Caching may not happen at all.** Haiku 4.5 caches only prefixes of 4096 tokens or more.
  The shared prompt files are about 7.6k characters (roughly 2k tokens). Tools render before
  `system` and each agent has its own tool, so agents never share one cache entry; only
  repeated calls of the same agent can, and only if tools plus prefix reach 4096 tokens. Measure
  `cacheRead` on the second `teach_segment` call before relying on it. Cost without caching
  is still about $0.30 to $0.60 per class (design doc estimate).
- Mock mode emits no `tool_delta`, so streaming falls through to the final-input path and
  behaves exactly as today.
- Prefetch costs tokens when discarded; only discard for Slower or a bad check.

**Acceptance criteria:**
- With a key, the first board shape of a segment is stored within about 2 s of the call
  starting (log timestamps).
- Usage lines are logged for every call; the cache result is measured and written down.
- `MODEL=mock` still passes the smoke test.

**Verify:** unit tests for `StepStreamer` and `streamTeach` (fake model emitting deltas) and
`ChunkBuffer`; one real class with a key.

---

## B6 Reliability (P1)

**Goal:** a public room cannot burn money or be spammed, and a bad Board Script never kills a
segment.

**Build:**
- Per-room token budget (`ROOM_TOKEN_BUDGET`, default 300000 input plus output tokens): over
  budget, `MeteredModel` answers from the mock and posts one `notice`.
- Invalid Board Script after the repair pass: retry the segment once in "simple" mode (only
  `page`, `text`, `box`, `sticky`, `say`); if that also fails, post the existing warning notice.
- Host moderation: **contract PR first** (`Api.moderate`, `MemberRow.muted`, `MemberRow.banned`).
  The migration is done (`20261017171342_member_moderation.sql`: columns, `is_member` ignores
  banned members). Then `POST /rooms/:id/moderate` (mute, unmute, kick). Muted members cannot ask; banned members
  cannot rejoin or read the room.
- Abuse: a learner with 3 flagged questions in a room is muted automatically.

**Acceptance criteria:** a room over budget switches to the mock with one notice; a kicked
learner gets 403 on rejoin and stops receiving broadcasts; a muted learner gets 403 on ask.

**Coordinate with Dev A:** buttons for mute/kick and the muted state in the ask box.

---

## B7 Deploy (P1, before rehearsal)

**Goal:** the demo runs on the hosted Supabase project, a hosted API and a hosted web app.

**Build:**
- Hosted Supabase: email signup with **confirmations on**, anonymous sign-ins **off**, TOTP MFA
  on, Site URL and redirect URLs set to the web domain (confirmation and reset links), SMTP for
  auth emails; put the service-role key in
  `.env.production.local`; `npm run db:push:prod -- --dry-run`, then `npm run db:push:prod`;
  load the seed course.
- API: one instance (the conductor lives in memory) on Railway or Render; `npm ci`, start
  `npm start -w @chalk/api`; env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `ANTHROPIC_API_KEY`, `WEB_URL`, `REQUIRE_ACCOUNT=1`, `SMTP_URL`, `MAIL_FROM`, `OTP_SECRET`,
  `VOYAGE_API_KEY`. Make the port read `PORT`. `@swc-node/register` is a
  devDependency but is needed at runtime: install dev dependencies on the host or move it.
- Web: Vercel from the repo root, build `npm run build -w @chalk/web`, output
  `packages/web/dist`, the three `VITE_*` env vars, and a SPA rewrite so `/r/:code` loads.
- Smoke against production: let `scripts/smoke.mjs` read another env file (`SMOKE_ENV`).

**Acceptance criteria:** `SMOKE_ENV=.env.production.local npm run smoke` passes against the
deployed API; two phones join by QR on the deployed site.

---

## B9 Accounts: registration and login (P0)

**Goal:** everyone has an account (email + password) before joining or hosting a room.

**Today:** anonymous sign-in everywhere (web, smoke, e2e, sandbox). The schema is ready: the
`on_auth_user_created` trigger creates a profile (username from signup metadata or the email,
collisions get a suffix). `AuthGuard` has the `REQUIRE_ACCOUNT=1` switch, off by default.

**Build:**
1. **Contract PR:** `Username`, `ProfileRow`, `MeRes`; `Api.createRoom` and `Api.joinRoom` make
   `displayName` and `color` optional (default: the profile's).
2. **Client flows are Supabase Auth, not our API:** `signUp({ email, password, options: { data:
   { username, display_name, color } } })`, `signInWithPassword`, `resetPasswordForEmail` +
   `updateUser({ password })`, `signOut`. Email confirmation: off locally (Mailpit still shows
   the mails), on in production with redirect URLs to the web app.
3. **API:** `GET /me` (profile, avatar URL, email, 2FA state); rooms use the profile name and
   color when the body omits them; `AuthGuard` refuses anonymous sessions when
   `REQUIRE_ACCOUNT=1` (403 "an account is required").
4. **Switch the tests to accounts:** e2e helpers, smoke and the sandbox create email users
   (`signUp` with a random `@example.com` address; local confirmations are off).
5. **Flip it** in one coordinated change with Dev A's login screens:
   `enable_anonymous_sign_ins = false` in `supabase/config.toml`, `REQUIRE_ACCOUNT=1` in `.env`
   and production.

**Decisions and traps:**
- Password rules: Supabase `minimum_password_length` (raise from 6 to 10) and
  `password_requirements = "lower_upper_letters_digits"`; the API never sees passwords.
- Existing anonymous users can be left to expire; nothing references them after the flip.
- `rooms.host_id` references `auth.users` without `on delete`, so deleting a user who hosted a
  room fails. Decide in B10 (account deletion): cascade the rooms, or hand them to a
  placeholder.

**Acceptance criteria:** with the flag on, an anonymous token gets 403 on every guarded route;
a registered user creates and joins rooms without sending a display name; smoke and e2e pass
with email users.

**Coordinate with Dev A:** register, login, reset and confirm screens; join by QR goes through
login and back to the room.

---

## B10 Profiles and profile pictures (P1)

**Goal:** people edit their profile (username, display name, color, bio) and change their
profile picture; others see public profiles.

**Today:** `profiles` has the columns and checks (`username` unique ignoring case,
`[A-Za-z0-9_]{3,24}`; bio max 280; `avatar_path` format), readable by any signed-in user. The
`avatars` bucket is public, 2 MiB, png/jpeg/webp.

**Build (`packages/api/src/accounts`):**
- `PATCH /me` (`Api.updateProfile`): username, displayName, color, bio. 409 when the username is
  taken.
- Avatar in two steps, so files never pass through the API:
  1. `POST /me/avatar/upload-url` (`contentType`) returns a signed upload URL for
     `avatars/<user id>/<uuid>.<ext>`;
  2. the client uploads straight to Storage; the bucket enforces type and size;
  3. `POST /me/avatar` (`path`) checks the object exists under the caller's folder, sets
     `avatar_path`, and removes the previous file.
  `DELETE /me/avatar` clears it.
- `GET /users/:username`: public profile (no email).
- `DELETE /me`: delete the account (`auth.admin.deleteUser`), its avatar files; resolve the
  `rooms.host_id` question from B9 first (new migration).

**Acceptance criteria:** a user changes username and avatar and every other member sees the new
picture; a second user cannot take the same username in another case; uploading a 3 MB file or
a GIF fails at Storage.

**Coordinate with Dev A:** profile page, avatar crop and upload; show avatars in the People
panel (public URL `<SUPABASE_URL>/storage/v1/object/public/avatars/<avatar_path>`).

---

## B11 Two-factor authentication (P1)

**Goal:** users can protect their account with an authenticator app (TOTP) or email codes.
Once on, a session must pass the second factor before it can use rooms.

**Today:** TOTP MFA is on in `supabase/config.toml`. The schema has `user_security`
(`email_2fa_enabled`), `email_otp_codes` (HMAC only), `mfa_sessions`, and `mfa_satisfied()`,
which `is_member()` requires, so RLS reads and realtime are gated too.

**Build (`packages/api/src/security`):**
1. **Spike first:** check whether the installed Supabase Auth offers email as a native MFA
   factor. If yes, use it, and drop our email tables in a new migration.
2. **TOTP:** client-side Supabase MFA (`enroll` shows a QR, `challenge` + `verify`). The API
   enforces it: `AuthGuard` reads the verified JWT's `aal` and `session_id` claims and answers
   401 `{ code: "mfa_required" }` when `mfa_satisfied()` would be false.
3. **Email codes:** `POST /me/2fa/email/send` (`purpose`), `POST /me/2fa/email/verify`
   (`code`, `purpose`); enable and disable require a verified code. Codes: 6 digits, HMAC-SHA256
   with `OTP_SECRET`, 10 minutes, 5 attempts, single use, at most 5 sends per hour. Mail goes
   through `MailPort` (Mailpit locally).
4. `GET /me/2fa`: which factors are on and whether this session passed.

**Decisions and traps:**
- Recovery codes were not chosen; without them a user who loses both factors needs support.
- Compare HMACs in constant time; never log codes.
- After disabling the last factor, delete that user's `mfa_sessions`.

**Acceptance criteria:** with email 2FA on, a fresh login gets 401 `mfa_required` and an empty
room read; the emailed code (read from Mailpit in e2e) unlocks that session only; a TOTP code
generated in the test upgrades to `aal2` and unlocks.

**Coordinate with Dev A:** 2FA settings page (QR for TOTP, email toggle) and the second login
step.

---

## B12 RAG: retrieval for the tutors (P1)

**Goal:** the tutors answer from the class's material and cite it on the board. Sources:
uploaded files (PDF, PPTX, DOCX, TXT, MD), web pages, the course syllabus plus past notes and
FAQ, and the live class transcript. How it works: `docs/SCHEMA.md`, "How RAG works".

**Today:** `sources`, `chunks` (full-text `tsv`, `embedding vector(1024)`), `match_chunks()`
(hybrid full text + vector, reciprocal rank fusion), the private `resources` bucket, and
`EmbeddingPort` with the no-embeddings adapter.

**Build (`packages/api/src/rag`):**
1. **Contract PR:** `SourceRow`, `Api.addSourceUrl`, `Api.sourceUploadUrl`, `Api.addSourceFile`;
   the citation format `res:<source id>#p<page>` documented.
2. **Ingest:** a worker takes pending sources (`for update skip locked`), extracts text per
   page, chunks it (pure `chunk.ts`: about 500 tokens, 15% overlap, page kept), embeds,
   stores, and marks the source `ready` or `failed`.
3. **Sources API:** upload URL + commit for files, add a URL (server-side fetch with an SSRF
   guard: http(s) only, no private addresses, 5 MB cap, HTML only), list, delete.
4. **Automatic sources:** the course syllabus when a class starts; each finished segment's
   narration (transcript, room scope); notes and FAQ when a class ends (course scope).
5. **Retrieval:** `RetrieveService` builds the query, embeds it, calls `match_chunks()`, and
   formats the top 6 passages; the lead tutor, thread tutor, triage inline answers and the Q&A
   beat get them after the cached prefix; `citations.ts` drops citations that point at
   missing sources or pages.
6. **Embeddings:** Voyage adapter (`VOYAGE_API_KEY`, `voyage-3.5`, 1024 dimensions); without a
   key everything still works on full text.

**Decisions and traps:**
- Retrieved text is untrusted (web pages, uploads): wrap it as reference material, never
  instructions.
- Keep passages out of the cached prefix, or caching breaks.
- Extraction libraries to evaluate when building: `unpdf` (PDF per page), `mammoth` (DOCX),
  `jszip` (PPTX slide XML), `linkedom` + `@mozilla/readability` (HTML).

**Acceptance criteria:** upload a PDF, ask about page 3, and the tutor's board cites
`res:<id>#p3`; with no embedding key, the same question still finds the page by keywords; a URL
pointing at `127.0.0.1` is refused.

**Coordinate with Dev A:** sources panel (upload, add link, status), citation chips on board
shapes.

---

## Definition of done (Dev B side of `docs/TASKS.md`)

- [ ] Questions to triage to clusters and four routes (B2)
- [ ] One thread per learner with catch-up (B4, B3)
- [ ] Host and ready gates count only present learners; host handoff (B5)
- [ ] End-of-class notes (B3)
- [ ] Lead tutor streams Board Script with the real model (B1)
- [ ] Accounts required: register, log in, reset password; tests use email users (B9)
- [ ] Profiles and profile pictures (B10)
- [ ] Two-factor authentication: authenticator app and email codes (B11)
- [ ] Tutors cite uploaded material, web pages, past notes and the class transcript (B12)
- [ ] `npm run smoke` green, and a rehearsal with `MODEL=mock`
