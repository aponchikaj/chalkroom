# Deploy

Three parts: the hosted Supabase project (database, auth, realtime, storage), the API on Render
(one instance, because each room's conductor lives in memory) and the web app on Vercel.
Do them in this order. Nothing here costs money on the free tiers except a paid model key.

## 1. Supabase (hosted project)

1. Dashboard > Project Settings > API Keys: copy the **secret key** (`sb_secret_...`) into
   `.env.production.local` as `SUPABASE_SERVICE_ROLE_KEY`. Never commit that file.
2. Apply the schema (if `db.<ref>.supabase.co` does not resolve, the network has no IPv6: use the
   session pooler string from the dashboard's Connect button as `DATABASE_URL`; this project is
   in eu-west-1): `npm run db:push:prod -- --dry-run`, check the list, then
   `npm run db:push:prod`. Load the seed course once with the SQL editor (`supabase/seed.sql`).
3. Authentication > Sign In / Providers: email on, **confirm email on**, **anonymous sign-ins
   off**. Password: minimum 10 characters, lower and upper case letters and digits.
4. Authentication > Multi-factor: TOTP (authenticator app) on.
5. Authentication > URL Configuration: Site URL = the Vercel URL (step 3); redirect URLs =
   `https://<web domain>/**` so confirmation and reset links land on `/login` and `/reset/new`.
6. Authentication > SMTP: a real mail sender (the built-in one is heavily rate limited).

## 2. API on Render

1. New > Blueprint > this repository (it reads `render.yaml`).
2. Fill the env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEB_URL` (the Vercel URL),
   the model key (`ANTHROPIC_API_KEY` in production, Claude Haiku 5.5; `GEMINI_API_KEY` or
   `GROQ_API_KEY` for free testing; one is required, the API refuses to start without it), `SMTP_URL`,
   `MAIL_FROM`. `REQUIRE_ACCOUNT=1` and `OTP_SECRET` are set by the blueprint.
3. Check `https://<api>/health` answers `{"ok":true,...}`.

### 2b. Or: API on Fly.io

`fly.toml` and `Dockerfile` are in the repo root. Fly builds the image on its remote builder, so
local Docker is not needed. One machine only, never stopped (the conductors live in memory).
A 1 GB shared machine is a few dollars a month on Fly (not free). The app `chalkroom-api` exists
(org personal, region lhr, next to the database in eu-west-1).

1. Done once: `fly apps create chalkroom-api` (org personal), then `fly ips allocate-v4 --shared`
   and `fly ips allocate-v6` (the first deploy could not add them itself).
2. Secrets (values never go in fly.toml):
   `fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... WEB_URL=https://<web domain> OTP_SECRET=<random> SMTP_URL=... MAIL_FROM=...`
   plus the model key: `ANTHROPIC_API_KEY=...` in production (Claude wins over the free tiers when
   set; `MODEL_ID` overrides the model id), or `GEMINI_API_KEY=...` for free testing. One is
   required: without a model key the API refuses to start and the health check fails.
3. `fly deploy --ha=false`, then `fly scale count 1` if a second machine was created.
4. Check `https://<app>.fly.dev/health`. Use that URL as `VITE_API_URL` on Vercel.

#### Server voice (TTS=kokoro)

The API makes every narration sentence once with Kokoro-82M (fp32, voice af_heart, in a worker
thread) and stores it in the public Storage bucket `tts` (migration `20261018130000_tts_bucket.sql`);
every learner plays the same file. The image bakes the model (~330 MB) into `/app/.models`.

- Machine: **2 dedicated vCPUs, 2 GB or more** (`performance-2x`, 4 GB, in `fly.toml`). Measured on
  a 6-core laptop: real-time factor 1.15 on 1 thread (slower than speech: the class would outrun
  it), 0.53 on 2 threads, 0.39 on all cores. A shared vCPU is throttled to a fraction of a core and
  falls behind. Memory: the voice worker is ~730 MB resident, next to Node and the embeddings model.
- `TTS_THREADS=2` matches the machine; `TTS=off` turns the voice off (the web then uses the system
  voice) and fits the old 1 GB shared machine.
- Push the migration (`npm run db:push:prod`) before deploying, or uploads fail and every sentence
  falls back to the system voice.
- Deploy: `npm run db:push:prod`, then `fly deploy --ha=false`, then `fly scale vm performance-2x
  --vm-memory 4096` if the machine kept its old size, and check `/health` shows `"tts":"kokoro"`.

## 3. Web on Vercel

The API is live at `https://chalkroom-api.fly.dev`. It accepts calls from
`https://chalkroom.vercel.app` and every `https://chalkroom-*.vercel.app` preview (`WEB_URL` on
Fly, comma-separated, `*` = one host label). A different project name needs `WEB_URL` updated:
`fly secrets set -a chalkroom-api WEB_URL=https://<name>.vercel.app,https://<name>-*.vercel.app`.

1. Import the repository, production branch `main`. `vercel.json` sets the install, build and
   output and the SPA rewrite (so `/r/<code>` links work). Leave the root directory as the repo root.
2. Env vars (Production and Preview):
   - `VITE_API_URL=https://chalkroom-api.fly.dev`
   - `VITE_SUPABASE_URL=https://rrtzjvznmvokznbfqive.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=` the publishable key (`sb_publishable_...`, Supabase > API Keys)
   Never set `VITE_DEV_LOGIN` there.
3. Supabase > Authentication > URL Configuration: Site URL = the Vercel URL; redirect URLs =
   `https://<vercel domain>/**` (confirmation and reset links land on `/login` and `/reset/new`).

## 4. Check it

- `SMOKE_ENV=.env.production.local npm run smoke` against the deployed API.
- Sign up on the site, start a class, join from a phone by QR, run a short class.
