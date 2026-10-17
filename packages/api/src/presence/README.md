# presence/ (B5)

Keeps `room_members.left_at` in step with Supabase Presence, so the ready gate counts only
learners who are really here, and hands the host role on when the host leaves.

| File | Role |
|---|---|
| `presence-tracker.ts` | Pure: who is gone (absent 15 s), who is back; `pickSuccessor` |
| `presence.service.ts` | Watches each live room's private channel with the service role |

Plan: `docs/PLANS_DEVB.md` Tasks 7-8 (start with the 10-minute spike in Task 8).
