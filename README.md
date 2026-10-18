# Chalkroom

Chalkroom turns an online course into a live class. Up to five people join one room, and an AI
tutor teaches them together on a shared whiteboard. It writes, draws and talks, and everyone sees
the same board at the same moment.

Anyone can ask a question whenever they want, and the class doesn't stop for it. The AI groups
similar questions, so five people asking the same thing get one good answer. If someone wants to
dig deeper, they get their own side tutor in a thread while the rest of the class keeps going.

- Live app: https://chalkroom-kohl.vercel.app/
- Demo video (Georgian, with subtitles): https://www.youtube.com/watch?v=R9EuEwDMxQc
- Built for Hacktoberfest Georgia 2026 by Lazare Mirziashvili (backend, AI agents, database,
  deploy) and Kote Bibilauri (frontend, design, the notebook classroom)

## How a class works

1. The host creates a room and shares the invite link. People join from a browser, no install.
2. The host presses Start. The tutor plans a short lesson and teaches it one segment at a time,
   drawing on the board while it speaks.
3. Questions go into a rail at the side. Similar ones are grouped ("3 asked") and each group is
   answered where it fits: for the whole class, in the next segment, as a short reply, or in a
   personal thread.
4. Each segment ends with a quick check and a ready vote, so nobody gets left behind.
5. When the class ends, everyone keeps shared notes and a deck of flashcards.

People only type. Only the tutor speaks, and captions are always on.

## Tech stack

- Web: React, Vite, Zustand
- API and AI agents: NestJS (lead tutor, thread tutor, triage, scribe)
- Data and realtime: Supabase (Postgres with row level security, Realtime, Auth with 2FA,
  Storage)
- Model: Claude Haiku 5.5 in production. Gemini and Groq free tiers for testing.
- Voice: generated on the server (Kokoro), so every learner hears the same audio
- Hosting: web on Vercel, API on Fly.io

The product design is in [`docs/design.md`](docs/design.md), and the task board is in
[`docs/TASKS.md`](docs/TASKS.md).

## Run it locally

You need Node 20 or newer and Docker. Docker runs a local Supabase, and the first start pulls
about 3 GB of images.

```bash
npm install
npm run db:start      # local Supabase on ports 55421-55429, applies migrations and the seed
npm run env           # writes .env from `supabase status`
# add a model key to .env.local, for example a free Gemini key for testing:
#   GEMINI_API_KEY=...   (aistudio.google.com/apikey)
npm run dev           # API on :3001, web on :5173
```

Open http://localhost:5173 and create a room. Open the invite link in a second browser or a
private window to join as another learner, then press Start class as the host.

The API won't start without a model key, because there is no scripted tutor. Every class is
taught by a real model.

To check the whole loop without a browser (the API has to be running with a key):

```bash
npm run smoke         # two users: join, board streams, check, ready gate, next segment
```

A full class makes real model calls. On the Gemini or Groq free tier that costs quota, on
Anthropic it costs money.

### Env files

Local dev runs against the local Supabase stack (Postgres 17 in Docker, plus auth and realtime).
Production uses the hosted Supabase project. Plain Postgres isn't enough, because the schema
needs Supabase's `auth` and `realtime` schemas.

| File | Committed | Used for |
|---|---|---|
| `.env` | no | Local Supabase, written by `npm run env` |
| `.env.local` | no | Your personal keys (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`). Wins over `.env` |
| `.env.production.local` | no | Hosted Supabase. Read by `vite build` and `npm run db:push:prod` |
| `*.example` | yes | Templates for the three files above |

To apply migrations to production, run `npm run db:push:prod`. It shows a dry run first and only
changes the database when you add `-- --yes`. Deployed API hosts get their production values as
platform env vars.

### Models

The API picks the first key it finds: `ANTHROPIC_API_KEY`, then `GEMINI_API_KEY`, then
`GROQ_API_KEY`. Set `MODEL` to force one, for example `MODEL=gemini` when you also have an
Anthropic key.

- Production: `ANTHROPIC_API_KEY=sk-ant-...` runs all four agents on `claude-haiku-5-5`. Effort is
  `medium` for the lead and thread tutors and `low` for triage and the scribe
  (`ANTHROPIC_EFFORT_<AGENT>` overrides it).
- Testing: `GEMINI_API_KEY` (free at aistudio.google.com/apikey) or `GROQ_API_KEY` (free at
  console.groq.com). On Groq each free model has its own 8000 tokens per minute, so the agents
  are spread out: the lead tutor on `openai/gpt-oss-120b`, the thread tutor on
  `qwen/qwen3.8-27b`, and triage, the scribe, planning and Q&A answers on
  `openai/gpt-oss-20b`. When a call would go over the quota the API waits for it if it can,
  otherwise the call fails and the class shows it. One class at a time runs fine on the free tier.
- To change models, set `MODEL_ID` for all agents, or `MODEL_ID_LEAD`, `MODEL_ID_THREAD`,
  `MODEL_ID_TRIAGE` and `MODEL_ID_SCRIBE` for one.

### When the model fails

The class says so instead of making something up.

- Lead tutor: a segment is retried twice while nothing of it is on the board yet. If it still
  fails, the class shows "The tutor could not continue. The host can press Resume to try again."
  and waits at the gate. The host can press Resume gate to teach the segment again, Skip to move
  on, or End class.
- Room token budget (`ROOM_TOKEN_BUDGET`): the class shows a notice and waits, and the host can
  end it.
- Thread tutor: a short error in the thread ("The tutor could not answer. Try again.").
- Triage: questions still move on ("The tutor will answer this in the next Q&A.").
- Course syllabus draft and quiz duel: an HTTP 503 with a plain message. The scribe skips quietly.

## Tests

`npm test`, `npm run typecheck` and `npm run build` never call a model. Unit tests use small fake
models, and CI runs only those three.

These need a model key and make real calls, so they refuse to run without one:

| Command | Needs |
|---|---|
| `npm run smoke`, `npm run bench`, `npm run e2e:web` | the stack running with a model key |
| `npm run test:api` | a key in `.env.local`. It starts its own API on :3101 |
| `npm run eval` | `GEMINI_API_KEY` or `GROQ_API_KEY` |

The cheapest option is the Gemini free tier.

## Commands

| Command | What it does |
|---|---|
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | `tsc` for the shared packages, web and API |
| `npm run test:api` | API end-to-end tests against the local stack |
| `npm run test:db` | Database tests (pgTAP) |
| `npm run e2e:web` | A whole class in three real browsers (host, learner, phone). Screenshots go to `.impeccable/e2e/` |
| `npm run bench` | Latency in ms for every route and the main class moments |
| `npm run db:reset` | Re-applies all migrations and the seed. This wipes local data |
| `npm run db:stop` | Stops local Supabase |
| `npx supabase migration new <name>` | Creates a new SQL migration. Never edit one that is already on `main` |
| http://localhost:3001/sandbox/ | Backend sandbox: several users, every route, a live room feed |
| http://127.0.0.1:55423 | Supabase Studio |

## Trying it in the browser

Run `npm run dev` against the local stack. You can also work on the classroom screens with no
backend or model at http://localhost:5173/dev/classroom?state=check, which uses the fixtures in
`packages/web/src/dev/`.

The dev build can sign in test accounts for you. Open `http://localhost:5173/?as=ana` in one tab
and `http://localhost:5173/r/<code>?as=gio` in another, and you have two different people. The
password is `Dev-password-123` and the accounts are `<name>@dev.chalkroom.local`.

Every endpoint is also listed in the sandbox at http://localhost:3001/sandbox/ and in
`packages/api/sandbox/api.http`.

## How it fits together

```
 web (React, Vite, Zustand)  --REST-->  api (NestJS)  --ModelPort-->  Claude Haiku 5.5 / free tier
   board player (pure reducer)            RoomConductor per room (phase, gate)
   StreamSync per stream                  agents: lead, triage, thread, scribe
        ^                                   |  append_event() (gap-free seq)
        |                                   v
   Supabase Realtime  <--  DB triggers  <--  Postgres + RLS (members read, the API writes)
   private channel room:{id}: "event" (stream events), "row" (room state), presence, laser
```

A few decisions hold it together:

- Each board is an append-only log with one writer. Only the API appends events,
  `append_event()` gives each stream a gap-free `seq`, and a trigger broadcasts every committed
  row. Clients replay the log with the same reducer, so late joiners and reconnects see exactly
  the same board. No CRDT needed.
- People write their own things (questions, votes, ready, reactions) through REST. Each of those
  has one owner, so nothing ever needs merging.
- The class syncs at gates, not frames. Voice plays on each device, and the ready gate is where
  everyone lines up again.

## Project layout

| Path | What's in it |
|---|---|
| `packages/schema` | The contract between web and API: Board Script, live events, rows, REST bodies, agent outputs |
| `packages/board` | The Board Script reducer and layout, shared by the API and the web |
| `packages/api` | NestJS: rooms, the conductor, agents, ModelPort, voice |
| `packages/web` | The React app: home, pre-join, classroom |
| `supabase/` | Config (ports 554xx), migrations, seed, database tests |
| `scripts/` | Env setup, production migrations, smoke, bench, browser runs |
| `video/` | The Georgian demo film: script, subtitles, scenes |

## Troubleshooting

- Ports in use: this project uses 55421-55429, so it can run next to other Supabase projects,
  which default to 54321 and up.
- Docker Desktop stops while pulling images: check the free space on the drive that holds
  Docker's data (Settings > Resources > Disk image location).
- No voice: browsers only play sound after you click somewhere on the page. Captions always show.
- Board empty after a refresh: the board loads from `events` through RLS, so make sure you
  joined the room (the pre-join screen) in the same browser.

## License

MIT. The board engine and renderer come from Chalkroom v1 (`kotebibo/chalkroom`).
