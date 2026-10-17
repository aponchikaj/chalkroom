# @chalk/api

The NestJS backend: rooms, the per-room conductor, the four agents, and (planned) accounts,
2FA and retrieval. Only this package writes to the database. Task detail:
`docs/DEVB_TASKS.md`; step-by-step plan: `docs/PLANS_DEVB.md`; database: `docs/SCHEMA.md`.

## Layout

```
packages/api/
  src/
    main.ts               bootstrap, CORS, sandbox static files
    app.module.ts         wires every feature (one module: features depend on each other)
    config.ts             every env var the API reads
    core/                 Supabase client, EventsService (the only event writer), AuthGuard, ZodPipe
    agents/               ModelPort (+ mock, Claude, fallback), lead/triage/thread/scribe agents, prompts/*.md
    conductor/            RoomConductor: one serial queue per room (phase, gate, teaching)
    rooms/                create, preview, join, leave, start, ready, host, checks, reactions
    questions/            ask, +1
    threads/              routes (B4 builds the service)
    triage/               B2   grouping and routing questions
    notes/                B3   end-of-class notes, note edits
    presence/             B5   presence-aware gate, host handoff
    accounts/             B9, B10  profile, avatars, public profiles, account deletion
    security/             B11  2FA: TOTP enforcement, email codes
    rag/                  B12  sources, ingest, chunking, embeddings (EmbeddingPort), retrieval
    mail/                 MailPort: SMTP (Mailpit locally) or console
    sandbox/              dev console settings route
  sandbox/                dev console page (/sandbox/), endpoint catalog, api.http
  test/                   unit tests (pure modules only; never import config.ts)
  e2e/                    end-to-end tests against the local stack
```

Folders marked with a task hold a `README.md` listing the files to create, their roles and the
plan task. Built so far: core, agents, conductor, rooms, questions, thread routes (501),
mail, the embeddings port, sandbox.

## Seams (ports) and their adapters

| Port | Adapters | Chosen by |
|---|---|---|
| `ModelPort` (`agents/model.port.ts`) | `MockModel`, `AnthropicModel` (inside `FallbackModel`) | `MODEL`, `ANTHROPIC_API_KEY` |
| `MailPort` (`mail/mail.port.ts`) | `SmtpMail`, `ConsoleMail` | `SMTP_URL` |
| `EmbeddingPort` (`rag/embeddings/embedding.port.ts`) | `LocalEmbeddings` (default), `NoEmbeddings` | `EMBEDDINGS`, `EMBEDDING_CACHE` |

Every port has an adapter that needs no network, so `MODEL=mock` with no keys always runs a
full class.

## Conventions

- **Pure core, thin service.** Decisions go in pure functions (no DB, no `config`), tested in
  `test/`. Services read rows, call the pure function, write rows.
- **One writer.** Events only through `EventsService.append` (validated with Zod). Rows only
  with the service-role client.
- **Contract first.** Request bodies and shapes come from `packages/schema/src/live.ts`.
- **Long work off the request.** Model calls that take seconds run on a lane (per room or per
  thread) and report through events; the request returns 202.
- **Plain text** in code, comments and messages.

## Adding an endpoint

1. Add the body schema to `Api` in `packages/schema/src/live.ts` (own PR when it is new).
2. Controller method with `@UseGuards(AuthGuard)` and `new ZodPipe(Api.x)`; logic in a service.
3. Add it to `sandbox/catalog.js` and `sandbox/api.http`.
4. Add e2e tests in `e2e/` for the happy path and each error (400, 401, 403, 404, 409).
5. `npm run typecheck && npm test && npm run test:api && npm run smoke`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev:api` | API on :3001 with `--watch` |
| `npm test` | unit tests |
| `npm run test:api` | e2e tests (needs `npm run db:start`; starts a mock API if none runs) |
| `npm run test:db` | pgTAP database tests |
| `npm run smoke` | two-user class end to end (API must run) |
| `npm run sandbox:tokens` | tokens for `sandbox/api.http` |
| http://localhost:3001/sandbox/ | dev console |
