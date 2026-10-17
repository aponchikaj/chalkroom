# triage/ (B2)

Groups questions into clusters and routes them (`class`, `later`, `inline`, `thread`) so every
question leaves `pending` within about 5 s. Runs on its own per-room lane, never on the
conductor queue.

| File | Role |
|---|---|
| `triage-plan.ts` | Pure: one triage tool call -> cluster writes, question writes, thread offers |
| `triage.service.ts` | `schedule(roomId)` (4 s batch window), `runNow(roomId)` (the gate awaits it), apply rows |

Plan: `docs/PLANS_DEVB.md` Tasks 1-2. Tests: `packages/api/test/triage-plan.test.ts`.
