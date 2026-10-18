# Chalkroom Live

Up to five people join a live class taught by an AI tutor on a shared whiteboard. Anyone can
ask at any time; a triage agent groups similar questions so the class gets one answer, and a
learner who wants to go deeper gets their own side tutor while the class keeps moving.

Product design: [`docs/design.md`](docs/design.md).
Who builds what next: [`docs/TASKS.md`](docs/TASKS.md).

## Quick start

Needs **Node 20+** and **Docker** (for local Supabase; about 3 GB of images on first start).

```bash
npm install
npm run db:start      # local Supabase on ports 55421–55429 (applies migrations + seed)
npm run env           # writes .env from `supabase status`
npm run dev           # API on :3001 (mock tutor) + web on :5173
```

Open http://localhost:5173, create a room, then open the invite link in a second browser
(or a private window) to join as another learner. The host presses **Start class**.

Check the whole loop without a browser (API must be running):

```bash
npm run smoke         # two users: join → board streams → check → ready gate → next segment
```

### Local vs production

Local dev runs everything against the **local Supabase stack** (Postgres 17 in Docker, plus auth
and realtime); production uses the hosted Supabase project. Plain Postgres is not enough: the
schema needs Supabase's `auth` and `realtime` schemas.

| File | Committed | Used for |
|---|---|---|
| `.env` | no | Local Supabase, written by `npm run env` |
| `.env.local` | no | Personal local secrets (`ANTHROPIC_API_KEY`); wins over `.env` |
| `.env.production.local` | no | Hosted Supabase; read by `vite build` and `npm run db:push:prod` |
| `*.example` | yes | Templates for the three files above |

Apply migrations to production with `npm run db:push:prod` (add `-- --dry-run` to preview).
Deployed API hosts get the production values as platform env vars.

### A real model instead of the scripted tutor

Add `GROQ_API_KEY=gsk_...` to `.env.local` (free at console.groq.com) and restart the API.
The agents spread over Groq's free models, each with its own 8000 tokens per minute: lead
tutor `openai/gpt-oss-120b`, thread tutor `qwen/qwen3.8-27b`, triage, scribe, planning and
Q&A answers `openai/gpt-oss-20b`. When a call would exceed the quota the API waits for it
(within each agent's limit) and otherwise answers from the scripted tutor. The free tier runs
one class at a time comfortably. Override models with `MODEL_ID` (all) or `MODEL_ID_LEAD`,
`MODEL_ID_THREAD`, `MODEL_ID_TRIAGE`, `MODEL_ID_SCRIBE`.

Production runs on Claude: `ANTHROPIC_API_KEY=sk-ant-...` runs all agents on `claude-haiku-5-5`
(it wins over the free tier when both keys are set; `MODEL=groq` forces the free tier). Effort per
agent: lead and thread `medium`, triage and scribe `low` (`ANTHROPIC_EFFORT_<AGENT>` overrides).
Force the scripted tutor with `MODEL=mock`.

### Other commands

| Command | What it does |
|---|---|
| `npm test` | Unit tests (Vitest) |
| `npm run e2e:web` | A whole class in three real browsers (host, learner, phone): triage, thread, check, gate, moderation, notes. Needs the stack running; screenshots in `.impeccable/e2e/` |
| `npm run test:api` | API end-to-end tests against the local stack (starts a mock API if none runs) |
| `npm run test:db` | Database tests (pgTAP) |
| `npm run bench` | Latency table in ms for every route and the key class moments (API must run) |
| http://localhost:3001/sandbox/ | Backend sandbox: several users, every route, live room feed |
| `npm run typecheck` | `tsc` for shared packages, web and API |
| `npm run db:reset` | Re-apply all migrations and the seed (wipes local data) |
| `npm run db:stop` | Stop local Supabase |
| `npx supabase migration new <name>` | New SQL migration (never edit one already on `main`) |
| Supabase Studio | http://127.0.0.1:55423 |

## Testing in the browser

`npm run dev` (API on 3001, web on 5173) against the local stack. Until the login screens exist,
the dev build signs in test accounts: `http://localhost:5173/?as=ana` in one tab and
`http://localhost:5173/r/<code>?as=gio` in another are two different people (password
`Dev-password-123`, accounts `<name>@dev.chalkroom.local`). The API runs on whichever model key is
set: `GEMINI_API_KEY` (free, testing), `ANTHROPIC_API_KEY` (production), or the mock. Every
endpoint is also in the sandbox at `http://localhost:3001/sandbox/` and in
`packages/api/sandbox/api.http`.

## How it fits together

```
 web (Vite + React + Zustand)  ──REST──▶  api (NestJS)  ──ModelPort──▶  Claude Sonnet 5.5 / free tier / mock
   ▲ board player (pure reducer)            RoomConductor per room (phase, gate)
   │ StreamSync per stream                  agents: lead · triage · thread · scribe
   │                                         │ append_event() (gap-free seq)
   └── Supabase Realtime ◀── DB triggers ◀──┘ Postgres + RLS (members read, API writes)
       private channel room:{id}: "event" (stream events), "row" (room state), presence, laser
```

- **Boards are append-only logs with one writer.** Only the API (agents) appends stream
  events; `append_event()` gives each stream a gap-free `seq`; a trigger broadcasts each
  committed row. Clients replay with the same reducer, so late joiners and reconnects are
  exact. No CRDT needed.
- **People write their own things** (questions, votes, ready, reactions) through REST; each
  has one owner, so nothing needs merging.
- **Sync at gates, not frames.** Voice plays locally on each device; the ready gate is where
  the class lines up again.

## Layout

| Path | What |
|---|---|
| `packages/schema` | **The contract**: Board Script (v1), live events, rows, REST bodies, agent outputs |
| `packages/board` | Pure Board Script reducer + layout (shared by API and web) |
| `packages/mock-tutor` | Scripted lesson and agent answers (dev + demo insurance) |
| `packages/api` | NestJS: rooms, conductor, agents, ModelPort |
| `packages/web` | React app: home, pre-join, classroom |
| `supabase/` | Config (ports 554xx), migrations, seed |
| `scripts/` | `write-env.mjs`, `smoke.mjs` |

## Troubleshooting

- **Ports in use**: this project uses 55421–55429 so it can run next to other Supabase
  projects (which default to 54321+).
- **Docker Desktop stops while pulling images**: check free disk space on the drive that
  holds Docker's data (Settings → Resources → Disk image location).
- **No voice**: browsers only speak after a click on the page; captions always show.
- **Board empty after a refresh**: the snapshot loads from `events` with RLS; make sure you
  joined the room (pre-join) with the same browser.

MIT licence. The board engine and renderer come from Chalkroom v1 (`kotebibo/chalkroom`).
