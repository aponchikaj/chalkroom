# Database schema (Supabase)

The source of truth is `supabase/migrations/*.sql`, applied in filename order. This file is the
map: what each table is for, who can read it, and how the pieces fit. Tests live in
`supabase/tests/database/*.test.sql` (pgTAP).

## Migrations

| File | What it adds | Task |
|---|---|---|
| `20261017000000_live_core.sql` | Rooms, members, streams, events, threads, clusters, questions, votes, checks, answers, ready votes, reactions, notes, FAQ, cards; `append_event()`; broadcast triggers; RLS; realtime channel policies | foundation |
| `20261017171339_accounts_profiles.sql` | Usernames, avatars, bios on `profiles`; profile row on signup (trigger); profiles readable by signed-in users; `avatars` bucket; `set_updated_at()` | B9, B10 |
| `20261017171342_member_moderation.sql` | `room_members.muted`, `room_members.banned`; banned members lose read access | B6 |
| `20261017171345_security_2fa.sql` | `user_security`, `email_otp_codes`, `mfa_sessions`; `mfa_satisfied()`; `is_member()` requires a passed second factor | B11 |
| `20261017171347_rag.sql` | pgvector; `sources`, `chunks`; `match_chunks()` hybrid search; `can_read_course()`; `resources` bucket | B12 |
| `20261017173829_user_settings_and_deletion.sql` | `user_settings` (tutor voice, captions, motion, theme, language, notifications); hosted rooms cascade when their host deletes the account | B10 |
| `20261017174833_mfa_facts.sql` | `mfa_facts()`: the API's one-query view of a user's second factors | B11 |
| `20261017190004_rag_ingest_queue.sql` | `claim_source()`: workers take the oldest pending source (`skip locked`), stuck ones re-queued after 10 min | B12 |
| `20261017190909_room_conductor_lease.sql` | `room_leases`, `resumable_rooms()`: one API instance drives a room; boot resumes only own or abandoned rooms | B7 |

### Commands

| Command | What it does |
|---|---|
| `npx supabase migration new <name>` | New migration file with a timestamp. Never edit one that is on `main` or applied to production. |
| `npm run db:reset` | Recreate the local database from all migrations and `supabase/seed.sql` (wipes local data). |
| `npm run test:db` | Run the pgTAP tests in `supabase/tests/database`. |
| `npm run db:push:prod -- --dry-run` | List migrations not yet applied to the hosted project. Without `--dry-run` it applies them (ask the team first). |

## Rules the schema enforces

- **Only the API writes.** Every table has RLS on; clients only get `select` policies. The API
  uses the service role. Exception: Supabase Auth writes `auth.users`, and the
  `on_auth_user_created` trigger writes the matching `profiles` row.
- **Boards are append-only logs.** `append_event()` gives each stream a gap-free `seq`; the
  `events_broadcast` trigger sends each committed row to `room:{room_id}`.
- **Rooms have at most 5 seats** (`rooms.seats between 1 and 5`; the join route returns 409 when full).
- **Membership is the read key.** `is_member(room)` = member, not banned, and second factor passed
  when the user turned one on. It gates every room table and the realtime channel.

## Tables

### Accounts

| Table | Columns that matter | Read by |
|---|---|---|
| `auth.users` | Supabase Auth: email, password hash, MFA factors (`auth.mfa_factors`) | Supabase only |
| `profiles` | `id` (= auth user), `username` (citext, unique ignoring case, `[A-Za-z0-9_]{3,24}`), `display_name` (1-32), `color` (`#rrggbb`), `avatar_path` (key in `avatars`), `bio` (max 280), timestamps | any signed-in user |

Signup metadata (`supabase.auth.signUp({ email, password, options: { data: { username, display_name, color } } })`)
seeds the profile. Without metadata the username comes from the email's local part, and a
taken name gets a numeric suffix (`ana_k`, `ana_k1`).

### Security (2FA)

| Table | Purpose | Read by |
|---|---|---|
| `user_security` | `email_2fa_enabled` per user | the user |
| `email_otp_codes` | HMAC of each emailed code, purpose (`login`/`enable`/`disable`), expiry, attempts, consumed | API only |
| `mfa_sessions` | sessions (JWT `session_id`) that passed email 2FA | API only |

**How 2FA works.**
1. Password login gives an `aal1` session.
2. Authenticator app (TOTP): the client uses Supabase MFA (`mfa.enroll`, `mfa.challenge`,
   `mfa.verify`); success upgrades the JWT to `aal2`.
3. Email code: the client calls the API, which emails a 6-digit code (stored as an HMAC, valid
   10 minutes, 5 attempts), then verifies it and inserts the session into `mfa_sessions`.
4. `mfa_satisfied()` is true when the JWT is `aal2`, or the user has no second factor turned on,
   or this session is in `mfa_sessions`. `is_member()` requires it, so a session that has not
   passed 2FA cannot read room data or join the realtime channel, whatever path it takes.

Supabase's built-in second factors are TOTP and phone; email codes are ours. Before building
B11, check whether the installed Supabase Auth offers email as a native MFA factor; if it does,
use it and drop `email_otp_codes`/`mfa_sessions` in a new migration.

### Classroom (live_core)

| Table | Purpose |
|---|---|
| `courses` | title, goal, syllabus (Markdown), visibility, owner |
| `rooms` | one live class: phase, segment, seats (max 5), invite code, lesson plan, main stream, gate state |
| `room_members` | who is in the room: role (`host`/`learner`), name, color, `left_at`, `muted`, `banned` |
| `streams`, `events` | append-only boards: `main` per room, one per thread; `seq` gap-free |
| `threads` | one personal side tutor per learner (`offered`/`open`/`closed`), `left_main_seq` |
| `questions`, `clusters`, `votes` | questions, triage groups and routes, anonymous +1 (votes never readable) |
| `checks`, `check_answers` | checks with answers (never readable), answers (own only) |
| `ready_votes`, `reactions` | gate votes, confusion reactions on shapes |
| `note_blocks` | shared end-of-class notes, versioned |
| `faq`, `cards`, `card_reviews` | course FAQ, flashcards, spaced-repetition state |

### Settings and leases

| Table | Purpose | Read by |
|---|---|---|
| `user_settings` | per-user preferences; defaults (`DEFAULT_SETTINGS`) until first saved | the user |
| `room_leases` | which API instance drives a live room, with a heartbeat | API only |

### Retrieval (RAG)

| Table | Columns that matter | Read by |
|---|---|---|
| `sources` | scope (`course_id` and/or `room_id`), `kind` (`file`, `url`, `syllabus`, `notes`, `faq`, `transcript`), `title`, `uri`, `checksum` (dedupe), `status` (`pending`, `processing`, `ready`, `failed`), counts | room members / course readers |
| `chunks` | `source_id`, `idx`, `page`, `heading`, `content`, `token_count`, `embedding vector(1024)` (nullable), `tsv` (generated, `simple` config) | same as its source |

Indexes: GIN on `tsv`, HNSW (cosine) on `embedding`, a partial queue index on pending sources.

## How RAG works

```
 upload / URL / class events        ingest worker (API)                       Postgres
 ───────────────────────────        ───────────────────                       ────────
 file  -> resources bucket ─┐
 URL   -> fetched page     ─┼─► sources row (pending) ─► extract text per page ─► chunk ~500 tokens
 syllabus, notes, FAQ      ─┤                            (PDF, PPTX, DOCX, HTML)   15% overlap
 segment transcript        ─┘                                   │
                                                                ▼
                                                   embed (EmbeddingPort: Voyage, or none)
                                                                │
                                                                ▼
                                                   chunks rows + sources.status = ready

 at answer time
 ──────────────
 lead tutor (segment objective), thread tutor (learner message), triage inline answers, Q&A beat
   -> query text (+ query embedding) -> match_chunks(room, course) -> top 6 passages
   -> added to the request AFTER the cached room prefix, each tagged with its source id and page
   -> the tutor cites them in Board Script: { "source": "res:<source id>#p<page>" }
   -> the API drops citations that point at sources or pages that do not exist
```

- **Four kinds of material.** Uploaded files and web pages (host or course owner adds them),
  the course syllabus plus past notes and FAQ (indexed when a class ends), and the live class
  transcript (each finished segment's narration is indexed for this room, so threads and the
  Q&A beat can quote earlier segments).
- **Hybrid search.** Full-text search always works, even with no embedding provider and no
  network (demo insurance). Embeddings add meaning ("why can't it sign" finds
  "invoke_signed"). Reciprocal rank fusion merges the two lists without tuning weights.
- **Embeddings.** Neither Groq nor Anthropic has an embeddings API, so search runs on full text
  today (the `NoEmbeddings` adapter). Questions become an OR of their keywords. A provider
  (e.g. Voyage AI) plugs into `EmbeddingPort` without schema changes; the column is
  1024-dimensional.
- **Cost and cache.** Retrieved text goes after the cached prefix, so prompt caching is not
  disturbed; about 6 passages (2-3k tokens) per call.
- **Safety.** Web pages and uploads are untrusted: the prompt marks them as reference material,
  never instructions. URL fetching blocks private network addresses and caps size.

## Storage buckets

| Bucket | Public | Limit | Types | Written by |
|---|---|---|---|---|
| `avatars` | yes (public URLs) | 2 MiB | png, jpeg, webp | API (signed upload URL, then commit) |
| `resources` | no | 50 MiB | pdf, pptx, docx, txt, md | API |

## Auth settings (`supabase/config.toml`)

- Email signup on; email confirmation off locally (on in production), emails land in Mailpit
  (http://127.0.0.1:55424).
- TOTP MFA enroll and verify on.
- **Anonymous sign-ins are off** (accounts required). Passwords: at least 10 characters with
  lowercase, uppercase and digits. The API refuses anonymous sessions too (`REQUIRE_ACCOUNT`,
  default on). The web needs its login screens (Dev A, A8) to sign anyone in.

## Still to change in the contract (`packages/schema/src/live.ts`)

The database is ahead of the contract. Before the API exposes these, add them in their own PR:
`ProfileRow`, `Api.updateProfile`, avatar upload/commit bodies, the 2FA bodies,
`MemberRow.muted` and `MemberRow.banned`, `SourceRow`, `Api.addSource`, and the citation
format documentation.
