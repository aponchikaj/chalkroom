# accounts/ (B9, B10)

Accounts are required (email + password through Supabase Auth). Supabase Auth handles signup,
login, email confirmation and password reset from the client; the `on_auth_user_created`
trigger creates the profile. This folder is the API side: reading and editing your profile,
avatars, public profiles and deleting your account.

| File | Role |
|---|---|
| `profiles.service.ts` | Read and update `profiles` (username, display name, color, bio) |
| `avatars.service.ts` | Signed upload URL into the `avatars` bucket, then commit: check type and size, set `avatar_path`, remove the old file |
| `me.controller.ts` | `GET /me`, `PATCH /me`, `POST /me/avatar/upload-url`, `POST /me/avatar`, `DELETE /me/avatar`, `DELETE /me` |
| `users.controller.ts` | `GET /users/:username` (public profile) |
| `username.ts` | Pure: normalize and validate usernames (same rule as the DB check) |

Schema: `profiles` and the `avatars` bucket in `supabase/migrations/20261017171339_accounts_profiles.sql`.
The account-required switch is `REQUIRE_ACCOUNT=1` (checked in `core/auth.guard.ts`).
Plan: `docs/PLANS_DEVB.md` Tasks 15-16. Contract first: `ProfileRow`, `Api.updateProfile`, avatar bodies.
