# Chalkroom Live — the course platform, reimagined as a live classroom

Design document · rev 1 · Oct 17, 2026 · Hacktoberfest Georgia 2026 · @GeoSafety

## One line

Up to five people join a live class taught by an AI tutor on a shared whiteboard. Anyone can ask
at any time. A triage agent groups similar questions so the class gets one answer, and a learner who
wants to go deeper gets their own side tutor while the class keeps moving.

## The problem

Khan Academy, Coursera and Udemy give you recorded video and a forum. You watch alone, and nobody
answers you in the moment. A question waits days for a forum reply. Most people who start an online
course never finish it.

A real classroom fixes this, but it has the opposite problem: one curious student with ten
questions can stall twenty others, and a shy student who has the same question never asks it.

AI tutors (including Chalkroom v1) fix the "nobody answers" part, but they are 1:1. You lose the
group: the shared pace, hearing other people's questions, explaining something to a peer.

## The idea

A course is no longer a playlist of videos. It is a **live class** that the AI teaches for *this*
group, right now:

- **One shared lesson.** A lead tutor draws and narrates on one board that everyone sees in sync.
- **Questions never stall the class.** You can ask at any time, as text or pinned to
  a shape on the board. A triage agent groups duplicates ("3 people asked this") and decides where
  each question is answered.
- **Threads for deep dives.** A learner who keeps asking about one subtopic gets a personal thread
  tutor in a side drawer, with its own mini board. The class goes on, and when they come back a
  catch-up card shows what they missed.
- **The class sets the pace.** Checks after each segment and ready votes keep everyone together.
  The host can always override.

### Track fit

| Track | How Chalkroom Live answers it |
|---|---|
| **01 Make It Better** | Online courses, rebuilt as if AI was there from day one. The lecture itself is generated for the group and adapts to its confusion. This is not a chatbot added next to a video. |
| **02 Multiplayer Agentic** | Several agents work on one shared classroom at once: a lead tutor, a thread tutor per learner, a triage agent and a scribe. They share state in real time without conflicts, because the board is an append-only log with a single writer. |

## Who uses it

| Persona | Wants | Gets |
|---|---|---|
| **Study group** (3–5 friends before an exam) | Learn a topic together, on their schedule | A private room from a course or an uploaded PDF, with a shared pace and shared notes |
| **Self-learner** | A course with other people, not alone with video | Joins an open room in the lobby that starts in 10 minutes |
| **The curious one** | Ask ten follow-ups without annoying anyone | Their own thread tutor; the class never waits |
| **The quiet one** | Ask without speaking up | Anonymous +1 on others' questions, and an answer that names the group, not them |

## User journey

1. **Find a class.** Browse courses (syllabi made by the community) or press *Start from a PDF / a
   goal*. The lobby lists open rooms: topic, seats (`3/5`) and start time.
2. **Join in about 10 seconds.** Open the invite link or scan the QR code, type a name, pick a
   colour, and you are in. Supabase anonymous auth means no signup. You can claim the account later.
3. **Lobby → start.** Presence avatars appear as people arrive. The host presses *Start*, or the
   class starts when all seats are ready.
4. **Learn.** The lead tutor teaches a segment of 2–4 minutes. Everyone's board draws in sync, and
   captions and the tutor's voice play on each device. People only type: learners never speak
   or use a microphone; the AI tutor is the only voice in the room.
5. **Ask.** Type, or select shapes and press *Ask about this*. Within a few
   seconds your question shows a status chip:
   - `grouped · 3 asked`: merged with others' questions; the class will get one answer.
   - `coming up next`: the lesson plan covers it in the next segment.
   - `answered`: a short inline reply in the question rail.
   - `→ thread`: a personal thread is offered (or opened, if you asked for one).
6. **Check.** Each segment ends with a quick check, and everyone answers. The class sees the answer
   spread (`4/5 got it`), and the tutor uses it to choose what to re-explain.
7. **Ready gate.** Each person's ready chip lights up. The class moves on when everyone is ready, a
   timer runs out, or the host skips. People in a thread are excused, so they never hold up the
   class.
8. **Q&A beat.** Before the next segment, the lead tutor answers the grouped class questions on the
   main board and credits the people who asked.
9. **Thread.** A side drawer opens with a personal tutor and mini board. The main board shrinks to a
   live picture-in-picture. Others see `Nika is in a thread on "bump seeds"` and can peek or join.
   *Share to class* pins a good answer to the question rail.
10. **Back to class.** A catch-up card reads: "While you were away: segment 4 (CPI basics).
    Replay at 2× or read the 3-line summary."
11. **Wrap-up.** The scribe writes shared notes, and anyone can edit them. Proposed flashcards go into
    a shared deck with personal FSRS scheduling. The question clusters become the course FAQ for
    future rooms. *Book the next session* sends a calendar invite to the group.

## Screens

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Chalkroom Live · Solana dev › PDAs     ●●●●○ 4/5 here    host: Ana    ⏱ 18:42 │
├──────────┬───────────────────────────────────────────────┬──────────────────┤
│ People   │                                               │ Questions │ Notes│
│ ● Ana  H │                                               │ ┌──────────────┐ │
│ ● Nika ↗ │            SHARED WHITEBOARD                  │ │ 3 asked      │ │
│ ● Gio    │      (draws + narrates in sync)               │ │ Why can't a  │ │
│ ● Mari   │                                               │ │ PDA sign?    │ │
│          │   "confused" x2 on "PDA" box (heat)           │ │ coming up    │ │
│ Syllabus │                                               │ ├──────────────┤ │
│  + Accts │  ── "A PDA is derived, not generated…" ──     │ │ Gio: what is │ │
│  ◐ PDAs  │                                               │ │ a bump? ans. │ │
├──────────┴───────────────────────────────────────────────┴──────────────────┤
│ Ready: +Ana +Gio ·Mari ↗Nika  [I'm ready]  │ [ ask anything… (text) ]  ⋯ thread │
└─────────────────────────────────────────────────────────────────────────────┘
```

`↗` = in a thread. Opening a thread slides a drawer in from the right (about 45% of the width),
and the main board continues as a live mini view in the corner.

| Screen | Purpose |
|---|---|
| Catalog / course page | Community syllabi, "start a room", past replays, FAQ |
| Lobby | Open rooms by topic, seats, start time; create a private room |
| Pre-join | Log in, room preview, join (no microphone: learners only type) |
| Classroom | Board, people, question rail, notes, ready bar, thread drawer |
| Recap | Shared notes, your questions and their answers, cards, next session |

## UX rules

1. **Never block the class on one person.** Threads, excused gates and timers all serve this rule.
2. **No question goes into a void.** Every question gets a visible status chip within about 5 s.
3. **Always know where you are.** Main or thread, what you missed, what comes next.
4. **Group first, then individual.** Group answers credit everyone who asked, and +1 is anonymous.
5. **The host rarely needs to act.** Defaults do the right thing; host controls are an override.
6. **Fast feedback.** Board steps stream as the model writes them, so the first shape appears in
   about 1–2 s.

## The agents

All agents run in NestJS, call the model through one `ModelPort` and answer only through validated
tool calls. Board output is Chalkroom's **Board Script** (`packages/schema`), checked with Zod
before anything is stored.

| Agent | Instances | Reads | Writes | Runs when |
|---|---|---|---|---|
| **Lead tutor** | 1 per room | Lesson plan, check results, class-routed clusters, confusion reactions, segment summaries | Main stream: `board`, `say`, `check`, `answer_cluster` | Lesson start; each gate (Q&A beat + next segment) |
| **Thread tutor** | 1 per open thread | Shared prefix (plan + summaries) + current board state + this learner's questions and checks | Thread stream: mini board, chat | Each message in the thread |
| **Triage** | 1 per room | New questions, open clusters, current segment summary, upcoming plan, each asker's recent questions | Cluster assignments and routes | 4 s after the last new question; always at a gate |
| **Scribe** | 1 per room | Finished segment events | Segment summary (3 lines), catch-up cards, final notes, FAQ entries | End of each segment; end of lesson |

### Triage in detail

The triage agent returns one tool call:

```json
{ "assign": [{ "questionId": "q7", "cluster": "c2" }, { "questionId": "q8", "cluster": "new", "title": "What is a bump seed?" }],
  "route":  [{ "cluster": "c2", "to": "class",  "reason": "3 askers, core objective" },
             { "cluster": "c5", "to": "later",  "segment": 5 },
             { "cluster": "c6", "to": "inline", "answer": "The bump is the first value 255→0 that pushes the address off the curve." },
             { "cluster": "c7", "to": "thread", "user": "u3", "reason": "4th question on bump seeds; tangent" }] }
```

| Route | Rule of thumb | What learners see |
|---|---|---|
| `class` | 2+ askers, or a core objective many are getting wrong | `grouped · 3 asked`; answered in the next Q&A beat with credit |
| `later` | Already in the upcoming plan | `coming up next` |
| `inline` | Short factual answer of 1–2 sentences | Reply in the rail, no board time used |
| `thread` | One asker going deep or off-path, especially the 3rd+ question on one subtopic | An offer: "Want to dig into bump seeds 1:1?" Opt-in, never forced |

With at most 5 learners there are only a few open questions at a time, so one model call clusters
them. No embedding model or vector database is needed. Anyone can still +1 a question by hand.

### Threads in detail

- One active thread per learner. A thread is its own stream with its own mini board.
- **Context:** the thread tutor's prompt begins with the same cached prefix as the lead tutor
  (system prompt + lesson plan + segment summaries), then the main board state and the learner's
  history. All threads share that prefix, so prompt caching makes them cheap.
- **Excused at gates:** a learner in a thread does not hold the ready gate.
- **Catch-up:** on return, the scribe's summaries of the segments they missed show as a card, with
  *Replay at 2×* on the main stream.
- **Peek / join / share:** threads are visible to the room (topic + owner). Others can peek
  read-only or join. *Share to class* posts the thread's best answer to the question rail as an
  answered cluster.
- Threads stay open into the recap, and the learner can keep going after class.

## Pacing: host + ready gates

```
        ┌────────────┐  segment ends   ┌────────────┐  all ready / timer / host skip  ┌────────────┐
 start ─▶  TEACHING  ├────────────────▶│   CHECK    ├────────────────────────────────▶│  Q&A BEAT  │
        └─────▲──────┘                 │ + READY    │                                 │ (clusters) │
              │                        └────────────┘                                 └─────┬──────┘
              └────────────────────────── next segment streams in ◀─────────────────────────┘
```

- **Gate passes** when every present learner who is not in a thread has voted ready, **or** 60 s
  pass after the first ready vote, **or** the host presses *Skip*.
- **Host controls:** Skip, Hold (pause the gate), Slower (the next segment re-explains), and End
  class. If the host leaves, the role passes to the longest-present member.
- **Anyone:** ready, "confused" / "got it" on shapes (the confusion heat), ask, +1.
- **Pipelining:** the lead tutor starts writing the next segment as soon as the check closes, so
  the board starts drawing as soon as the gate passes.

## Multiplayer: how it stays correct

The main design choice: **only agents write the boards, so a board is an append-only event log with
one writer.** People write their own things: questions, votes, reactions and a personal pen layer.
Each of those has a single owner, so nothing ever needs merging. No CRDT is needed.

### Streams and sequence numbers

- Every room has a `main` stream, and every thread has its own stream.
- `events(room_id, stream, seq, kind, data, actor, t)`. `seq` comes from a per-stream counter that
  is incremented in the same transaction as the insert, so it has no gaps and a total order.
- A Postgres trigger broadcasts each inserted event on the room's private Realtime channel
  (Supabase *Broadcast from Database*). An event is broadcast **only if it was committed**.

### Client sync algorithm

1. Subscribe to `room:{id}` and buffer incoming events.
2. Fetch a snapshot of events from the last page checkpoint up to `seq = N`.
3. Replay through the Board Script reducer (`packages/board`), then apply buffered events with
   `seq > N` in order.
4. On a gap (`seq` jumps), fetch `events?after=lastSeq`. Applying an event is idempotent by `seq`.
5. On reconnect, repeat from step 1. Late joiners render past segments instantly and the current one
   is fast-forwarded.

### Sync at gates, not frames

Voice runs locally on each device (browser TTS by default), so people finish a segment a few
seconds apart. That is fine: the **ready gate is the sync point**. Inside a segment, playback is
local and smooth; between segments, everyone is aligned. Captions and draw-on animation follow each
device's own audio, so voice and board always match.

### Ephemeral vs durable

| Data | Path | Stored |
|---|---|---|
| Board, say, check, cluster answers | Nest → `events` insert → DB broadcast | Yes |
| Questions, +1, reactions, check answers, ready votes | Client → Nest REST (validate, rate-limit) → DB → broadcast | Yes |
| Who's here, who's in a thread, typing, ready | Supabase **Presence** | No |
| Laser pointer (hold `L`) | Supabase **Broadcast** (client to client, throttled to 20 Hz) | No |

### One conductor per room

The NestJS `Conductor` is a per-room actor: a serial queue that owns the room's phase (`teaching |
check | qa | ended`), the gate, and which agent may write to `main`. The phase lives in
`rooms.phase`, so a restarted server resumes from the database. Several Nest instances can run
side by side: an instance moves a room only while it holds the room's lease (`room_leases`,
`take_room_lease()`), heartbeats its leases every 10 s, and takes over a room whose owner in the
same instance group (`INSTANCE_GROUP`) stopped heartbeating for 30 s. Idle conductors of rooms in
the lobby or ended are released at the heartbeat.

### Failure handling

| Failure | Behaviour |
|---|---|
| Model error or timeout | The adapter retries (the Anthropic SDK twice; Groq and Gemini once on a 503, then the provider's spare models). The lead tutor then retries the segment twice with backoff while nothing is drawn; if it still fails the class shows a notice and holds at the gate until the host presses Resume (teach it again), Skip or End. A thread posts a short error; triage routes to the next Q&A; course drafts and duels answer 503. There is no scripted fallback |
| Room token budget reached | A notice, and the class holds; the host may end the class |
| Invalid Board Script | Zod error sent back to the model for one repair pass; if still invalid, the tutor answers text-only in chat |
| Client drops | Presence leave after 15 s; the gate stops counting them; rejoin replays from `lastSeq` |
| Nest restarts | Phase and events are in Postgres; the conductor resumes on the next tick |
| Host leaves | Host role passes automatically |
| Spam / abuse in public rooms | Question rate limit (6/min); triage flags abuse; host can mute or kick |

## Model choice

**Groq's free tier (decision 2026-10-17), spread over three models.** Each free model allows
about 8000 tokens per minute, so the agents use different models: the lead tutor
`openai/gpt-oss-120b`, the thread tutor `qwen/qwen3.8-27b`, and triage, the scribe, lesson
planning and Q&A answers `openai/gpt-oss-20b`. The API paces calls from Groq's rate-limit
headers; when quota is not back in time the call fails and the class shows it (Failure handling). All three
produced valid Board Script on the first try in testing. The free tier is for testing only.

**Testing on Gemini's free tier (decision 2026-10-18).** Same OpenAI-compatible adapter as
Groq: lead `gemini-3.6-flash` (same lesson quality as 3.8-flash in the eval, 12 s instead of
19 s per segment), thread `gemini-3.8-flash`, triage, the scribe, planning and Q&A
`gemini-3.5-flash-lite`. The free tier limits requests per minute and per day per model (Google no
longer publishes the numbers; about 10 per minute is reported), so calls are paced per model
(`GEMINI_RPM`), a per-day 429 moves the agent to the next spare (`GEMINI_SPARES_TUTOR` for the
tutors, `GEMINI_SPARES_LITE` for triage and the scribe) until the quota
is back, and the call fails when nothing is left. Free-tier prompts may be used by Google to
improve its products: test classes only, never real learners' data.

**Production: Claude Haiku 5.5 (`claude-haiku-5-5`) for all four agents (decision
2026-10-18; the default in `config.ts`, `MODEL_ID` and `MODEL_ID_<AGENT>` override).** The provider
order is Anthropic, Gemini, Groq (the first key set wins; `MODEL` forces one; with no key the API
refuses to start). At run time a failed call does not move to another provider: the class shows
the failure (Failure handling). The request settings in
`agents/anthropic.params.ts` (`tool_choice: auto`, adaptive thinking, per-agent effort, the
server-side refusal fallback) were written while Sonnet 5.5 was the plan; on 2026-10-18 a real
class on Haiku 5.5 ran all four agents correctly with them (plan, two taught segments, a grouped
question answered in class, a thread reply with a board, three summaries).

Price (official, per million tokens, prompts up to 100k): input $0.10, 5-minute cache write
$0.125, cache hit $0.01, output $0.50. That test class used 44,513 tokens in 9 calls: $0.0066. The original analysis below was written for Claude Haiku 4.5; the needs are the
same.

**Original choice: Claude Haiku 4.5 for all four agents.**

| Need | Why Haiku 4.5 fits |
|---|---|
| Fast | Low time to first token; board steps stream to the screen as they are written |
| Cheap | $1 / M input, $5 / M output; cache reads at 0.1× |
| Reliable structured output | Strong tool use, which Board Script, triage routes and checks all depend on |
| Shared context | Prompt caching on the lesson prefix that the lead, thread and triage agents all reuse |

**Estimated cost of a 45-minute class of 5:** lead tutor about 15 segments × (8k in, 1.5k out); triage
about 30 calls × (2k in, 0.3k out); threads about 30 turns × (6k in, 0.8k out). That comes to roughly
**$0.30–$0.60 per class before caching, or a few cents per learner**. This is an estimate, to be
measured during the hackathon.

`ModelPort` is one interface (`stream(messages, tools)`), so a fallback provider (for example a
Gemini Flash-class model) or a stronger model for syllabus drafting can be added without touching
the agents.

## Tools and integrations

| Tool | How it works | Phase |
|---|---|---|
| Whiteboard primitives | Boxes, arrows, KaTeX, code, tables, charts, Mermaid (Chalkroom renderer) | MVP (reuse) |
| Voice | Tutor only: browser TTS per device. No microphone or speech-to-text for people | MVP (reuse) |
| Shared PDFs and links | Upload to Supabase Storage → extract with `packages/ingest` → Postgres full-text search → `[[res:id#p12]]` citations | Stretch |
| Code runner | Pyodide / JS sandbox in the browser on a board `code` shape; output can be sent to the tutor | Stretch |
| Graphing | function-plot (MIT) embed for "plot y = …" | Roadmap |
| Calendar | `.ics` / Google Calendar invite for the next session | Stretch |
| Export | Notes → Markdown / Notion; cards → Anki CSV (reuse) | Roadmap |
| Invite | Link + QR code; share card for Discord / Telegram | MVP |

## Community features

| Feature | How it works |
|---|---|
| **Open classrooms lobby** | Public rooms with topic, seats and start time. Join with one click. A room starts when the host says so or when it is full and everyone is ready. |
| **Community courses** | A course is a syllabus (Chalkroom's `syllabus.md` format) plus optional resources. Anyone can publish one or fork and remix it. The catalog shows ratings and how many rooms ran it. |
| **Living FAQ** | Answered question clusters are saved per course topic. Future triage checks the FAQ first, so popular questions get instant, already-checked answers. The course gets better every time it runs. |
| **Shared notes** | The scribe drafts notes made of blocks. Anyone can edit, with one editor per block shown by presence (`Gio is editing`), so edits never conflict. |
| **Teach-back** | The tutor invites a volunteer to explain a concept in text. Peers react, and the tutor adds what was missing. This is Feynman mode for a group. |
| **Class quiz duel** | A live quiz, Kahoot-style. Everyone answers at once, the class sees the answer spread, and the tutor re-teaches what the class missed. |
| **Shared deck, personal schedule** | Group flashcards with FSRS scheduled per learner (reuse `ts-fsrs`). |
| **Kudos** | "Your question helped 3 people." Credit for questions that turn into class answers and for shared threads. |
| **Recurring study groups** | Save a group and book the next session; the syllabus continues where the group stopped. |
| **Replay library** | Past public lessons with question clusters as chapters ("jump to: Why can't a PDA sign?"). |

## Architecture

```
 React (Vite, Zustand, Chalkroom board)            NestJS                                    Anthropic API
 ┌──────────────────────────────┐   REST    ┌─────────────────────────────────┐  stream  ┌──────────────┐
 │ Classroom · Thread drawer    ├──────────▶│ Rooms (join, ask, ready)        │─────────▶│ Haiku 5.5    │
 │ Board player (pure reducer)  │           │ Conductor (room actor, gates,   │◀─────────│ (ModelPort)  │
 │ Question rail · Notes        │           │   phase, leases)                │          └──────────────┘
 └──────▲───────────────▲───────┘           │ AgentsModule  lead·thread·      │
        │ Realtime      │ Presence /        │   triage·scribe                 │
        │ (broadcast    │ laser             │ Sources + ingest (FTS, vectors) │
        │  from DB)     │                   └───────────────┬─────────────────┘
 ┌──────┴───────────────┴──────────────────────────────────▼──────────────────┐
 │ Supabase: Auth (anonymous → claim) · Postgres (events, rooms, questions,    │
 │ clusters, threads, notes, faq, cards) + RLS · Realtime · Storage            │
 └─────────────────────────────────────────────────────────────────────────────┘
```

### Stack

| Layer | Choice | Notes |
|---|---|---|
| Web | React + Vite + Zustand + TanStack Query | Reuses `packages/web` board, quiz grading, FSRS and markdown |
| Board | `packages/board` + `packages/schema` | Pure reducer: replay any stream from its events |
| API / agents | NestJS (Node 20) | Holds the API key; the conductor actor; agents; Zod validation |
| Model | Claude Haiku 5.5 via `@anthropic-ai/sdk` (Gemini or Groq free tiers for testing) | Streaming + tool use + prompt caching |
| Data / realtime | Supabase Postgres + Realtime + Presence + Storage + Auth | RLS: members read their room; only the service role writes `events` |
| Hosting | Static web on Vercel or Netlify; Nest on Railway, Fly or Render; Supabase Cloud | One Nest instance for the demo |
| Demo insurance | A rehearsed class on the production model, local Supabase | The class shows a model failure and holds; the host resumes |

### Data model (core tables)

| Table | Key columns |
|---|---|
| `profiles` | `id`, `display_name`, `color` |
| `courses` | `id`, `title`, `goal`, `syllabus jsonb`, `visibility`, `owner_id`, `forked_from` |
| `rooms` | `id`, `course_id`, `topic_id`, `host_id`, `phase`, `segment`, `visibility`, `seats=5`, `invite_code` |
| `room_members` | `room_id`, `user_id`, `role`, `joined_at`, `left_at` |
| `streams` | `id`, `room_id`, `kind main/thread`, `last_seq` |
| `events` | `stream_id`, `seq`, `kind`, `data jsonb`, `actor`, `t` · PK `(stream_id, seq)` |
| `threads` | `id`, `room_id`, `owner_id`, `stream_id`, `topic`, `status`, `shared_answer` |
| `questions` | `id`, `room_id`, `author_id`, `text`, `anchor jsonb`, `segment`, `cluster_id`, `status` |
| `clusters` | `id`, `room_id`, `title`, `route`, `answer_event`, `asker_count` |
| `votes` | `question_id`, `user_id` |
| `checks` / `check_answers` | `room_id`, `segment`, `question jsonb` / `user_id`, `answer`, `correct` |
| `ready_votes` | `room_id`, `segment`, `user_id` |
| `reactions` | `room_id`, `user_id`, `shape_id`, `kind` |
| `note_blocks` | `room_id`, `idx`, `markdown`, `edited_by`, `version` |
| `faq` | `course_id`, `topic_id`, `question`, `answer`, `askers_total` |
| `cards` / `card_reviews` | shared card / per-user FSRS state |

## Accounts, voice and RAG (decisions 2026-10-17)

- **Accounts are required**: email + password, optional 2FA (authenticator app or email codes),
  profiles with a picture and settings. Joining by QR goes through login.
- **Text only for people**: no microphone; only the AI tutor speaks (browser TTS).
- **RAG**: tutors search and cite uploaded files, web pages, the syllabus with past notes and
  FAQ, and the class transcript (`docs/SCHEMA.md`, "How RAG works").
- **At most 5 people per room.**

## What we build by Sunday 12:00 (team of 2–3)

| Priority | Scope |
|---|---|
| **P0 (the demo)** | Anonymous join by link; rooms of 5 with presence; host + ready gates; lead tutor streaming Board Script to a shared board; questions → triage → clusters + 4 routes; one thread per learner with catch-up; class checks with answer spread; end-of-class notes |
| **P1** | Confusion reactions on shapes; Share to class; laser pointer; shared PDF with citations; FAQ reuse |
| **P2 (slides only)** | Lobby and community courses; quiz duel; teach-back; shared deck; calendar; replays |

**Split:**
- **Frontend:** port the board and classroom shell, add the question rail and thread drawer.
- **Backend:** NestJS conductor, agents and prompts (adapted from the Chalkroom skills).
- **Data and demo:** Supabase schema, RLS and broadcast triggers; the demo script; the deck.

**Order:** schema + realtime round trip → lead tutor on a shared board → gates → questions + triage →
threads → polish → demo rehearsal on the production model.

### Demo script (3 minutes, 3 laptops + 1 phone)

1. The host creates a room "Solana PDAs" and three people join by QR code. The avatars pop in.
2. The tutor teaches: everyone's board draws in sync.
3. Two people ask "why can't a PDA sign?" in different words → one card: `grouped · 2 asked`.
4. One person asks a third question about bump seeds → `Want to dig in 1:1?` → a thread opens with
   its own mini board while the main class keeps teaching.
5. The check runs: `3/4 got it`; the gate passes without waiting for the person in the thread.
6. Q&A beat: the tutor answers the grouped question on the board and credits both askers.
7. The thread learner returns and sees the catch-up card. Wrap-up: shared notes appear for everyone.

## Risks

| Risk | Mitigation |
|---|---|
| Venue Wi-Fi | A phone hotspot for the model calls, local Supabase; a recorded run as the last resort |
| Model latency on stage | Streaming steps, pipelined next segment, short segments |
| Triage over-merges different questions | Show the merged questions in the card; the asker can "unmerge" with one click |
| Threads feel isolating | Peek/join, Share to class, catch-up cards |
| TTS drift between devices | Sync at gates; captions follow local audio |
| Cost of open public rooms | Per-room token budget; Haiku pricing; FAQ reuse cuts repeat questions |
