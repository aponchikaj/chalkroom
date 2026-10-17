# notes/ (B3)

End-of-class shared notes and the edit route.

| File | Role |
|---|---|
| `notes.ts` | Pure: note blocks from the plan, segment summaries, check results, answered clusters |
| `notes.controller.ts` | `PUT /rooms/:id/notes/:blockId` with an optimistic version check (409 when stale) |

Segment narration readers live next to the conductor (`conductor/narration.ts`).
Plan: `docs/PLANS_DEVB.md` Tasks 5-6.
