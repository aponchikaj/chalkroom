# Chalkroom Live

Up to five people join a live class taught by an AI tutor on a shared whiteboard. Anyone can
ask at any time; a triage agent groups similar questions so the class gets one answer, and a
learner who wants to go deeper gets their own side tutor while the class keeps moving.

Hacktoberfest Georgia 2026 · GeoSafety. Product design: [`docs/design.md`](docs/design.md).
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

### Claude instead of the scripted tutor

Add `ANTHROPIC_API_KEY=sk-ant-…` to `.env` and restart the API. All four agents use
`claude-haiku-4-5` (override with `MODEL_ID`). If a model call fails, the API falls back to
the scripted tutor for that call. Force the mock with `MODEL=mock`.

### Other commands

| Command | What it does |
|---|---|
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | `tsc` for shared packages, web and API |
| `npm run db:reset` | Re-apply all migrations and the seed (wipes local data) |
| `npm run db:stop` | Stop local Supabase |
| `npx supabase migration new <name>` | New SQL migration (never edit one already on `main`) |
| Supabase Studio | http://127.0.0.1:55423 |

## How it fits together

```
 web (Vite + React + Zustand)  ──REST──▶  api (NestJS)  ──ModelPort──▶  Claude Haiku 4.5 / mock
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
