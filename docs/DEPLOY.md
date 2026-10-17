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
   `GROQ_API_KEY` (free tier) or leave it empty for the scripted tutor, `SMTP_URL`,
   `MAIL_FROM`. `REQUIRE_ACCOUNT=1` and `OTP_SECRET` are set by the blueprint.
3. Check `https://<api>/health` answers `{"ok":true,...}`.

### 2b. Or: API on Fly.io

`fly.toml` and `Dockerfile` are in the repo root. Fly builds the image on its remote builder, so
local Docker is not needed. One machine only, never stopped (the conductors live in memory).
A 1 GB shared machine is a few dollars a month on Fly (not free). The app `chalkroom-api` exists
(org personal, region lhr, next to the database in eu-west-1).

1. `fly launch --no-deploy --copy-config --name <free app name>` (writes the name into fly.toml).
2. Secrets (values never go in fly.toml):
   `fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... WEB_URL=https://<web domain> OTP_SECRET=<random> SMTP_URL=... MAIL_FROM=...`
   plus `GROQ_API_KEY=...` for the real tutors (leave it out for the scripted tutor).
3. `fly deploy --ha=false`, then `fly scale count 1` if a second machine was created.
4. Check `https://<app>.fly.dev/health`. Use that URL as `VITE_API_URL` on Vercel.

## 3. Web on Vercel

1. Import the repository; `vercel.json` sets the install, build and output and the SPA rewrite
   (so `/r/<code>` links work).
2. Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (the publishable key),
   `VITE_API_URL` (the Render URL).
3. Put the Vercel URL back into Supabase (Site URL, redirects) and Render (`WEB_URL`).

## 4. Check it

- `SMOKE_ENV=.env.production.local npm run smoke` against the deployed API.
- Sign up on the site, start a class, join from a phone by QR, run a short class.
