# Dev B tasks: backend and agents (Lazare Mirziashvili)

Every Dev B task from `docs/TASKS.md`, expanded: what exists today, what to build, the design
decisions, the traps found while reading the code, and how to know it is done. The step-by-step
implementation (files, code, tests, commands) is in [`PLANS_DEVB.md`](PLANS_DEVB.md).

Read first: `docs/design.md` (product), `docs/TASKS.md` (lanes and milestones), `CLAUDE.md`
(architecture rules). Dev B owns `packages/api/**`, `supabase/**`, `packages/mock-tutor/**`.
`packages/schema/**` is shared: change it first, in its own small PR, reviewed by Dev A.

## Order and milestones

| Order | Task | Priority | Milestone | Unblocks Dev A | Size |
|---|---|---|---|---|---|
| 1 | B2 Triage wiring | P0 | M2 Questions | A1 question rail statuses | M |
| 2 | B4 Threads | P0 | M3 Threads | A3 thread drawer | M |
| 3 | B3 Scribe and notes | P0 | M4 Wrap-up | A3 catch-up card, A5 notes | M |
| 4 | B5 Presence gate and host handoff | P0 | M4 Wrap-up | A4 ready bar | M |
| 5 | B1 Real model | P0 | M5 Polish | nothing (mock speaks the same contract) | M |
| 6 | B6 Reliability | P1 | M5 Polish | host mute/kick buttons | M |
| 7 | B7 Deploy | P1 | M5, before rehearsal | the demo itself | S |
| 8 | B8 Shared PDF | P1 extra | after the demo works | citations UI | L |

B1 can start any time once an `ANTHROPIC_API_KEY` exists; it is listed fifth because the mock
already covers the demo and B2 to B5 unblock Dev A.

## Working rules for every task

- **Branch:** commit on `Lazare`; open a PR `Lazare` to `main` at the end of each milestone
  (CI green). Ask before every push (CLAUDE.md rule 2).
- **Local stack:** `npm run db:start`, `npm run env`, `npm run dev`. Local Supabase runs
  Postgres 17 in Docker; production is the hosted project (`.env.production.local`).
- **Gate before each commit:** `npm run typecheck`, `npm test`, and with the API running,
  `npm run smoke` (mock tutor, two users, full class).
- **Mock first:** every agent keeps a working `mock` answer; `MODEL=mock` must always run a full
  class.
- **One writer:** stream events only through `EventsService.append`; rows only from the API.
- **Contract:** never send a shape not in `packages/schema/src/live.ts`. Only B6 (moderation)
  and B8 (resources) need contract changes.
- **Pure core, thin services:** put decision logic in pure functions (no DB, no `config`
  import) so Vitest can test them; services only read, call the pure function, and write.
  Importing `packages/api/src/config.ts` in a test throws (it requires env vars).

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
- Host moderation: **contract PR first** (`Api.moderate`, `MemberRow.muted`, `MemberRow.banned`),
  then a migration (columns plus `is_member` ignoring banned members), then
  `POST /rooms/:id/moderate` (mute, unmute, kick). Muted members cannot ask; banned members
  cannot rejoin or read the room.
- Abuse: a learner with 3 flagged questions in a room is muted automatically.

**Acceptance criteria:** a room over budget switches to the mock with one notice; a kicked
learner gets 403 on rejoin and stops receiving broadcasts; a muted learner gets 403 on ask.

**Coordinate with Dev A:** buttons for mute/kick and the muted state in the ask box.

---

## B7 Deploy (P1, before rehearsal)

**Goal:** the demo runs on the hosted Supabase project, a hosted API and a hosted web app.

**Build:**
- Hosted Supabase: turn on anonymous sign-ins; put the service-role key in
  `.env.production.local`; `npm run db:push:prod -- --dry-run`, then `npm run db:push:prod`;
  load the seed course.
- API: one instance (the conductor lives in memory) on Railway or Render; `npm ci`, start
  `npm start -w @chalk/api`; env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `ANTHROPIC_API_KEY`, `WEB_URL`. Make the port read `PORT`. `@swc-node/register` is a
  devDependency but is needed at runtime: install dev dependencies on the host or move it.
- Web: Vercel from the repo root, build `npm run build -w @chalk/web`, output
  `packages/web/dist`, the three `VITE_*` env vars, and a SPA rewrite so `/r/:code` loads.
- Smoke against production: let `scripts/smoke.mjs` read another env file (`SMOKE_ENV`).

**Acceptance criteria:** `SMOKE_ENV=.env.production.local npm run smoke` passes against the
deployed API; two phones join by QR on the deployed site.

---

## B8 Shared PDF with citations (P1 extra)

**Goal:** a host uploads a PDF; the tutor cites pages on the board (`source: "res:<id>#p12"`,
already in Board Script).

**Build:** contract PR (resources, upload endpoint), Storage bucket, page-level text extraction,
Postgres full-text search, top pages injected into the lead tutor's request after the cached
prefix, citations validated against existing resources. Port `packages/ingest` from the v1 repo
(`github.com/kotebibo/chalkroom`) once its code is checked.

**Only start after M4 is merged and the demo runs end to end.**

---

## Definition of done (Dev B side of `docs/TASKS.md`)

- [ ] Questions to triage to clusters and four routes (B2)
- [ ] One thread per learner with catch-up (B4, B3)
- [ ] Host and ready gates count only present learners; host handoff (B5)
- [ ] End-of-class notes (B3)
- [ ] Lead tutor streams Board Script with the real model (B1)
- [ ] `npm run smoke` green, and a rehearsal with `MODEL=mock`
