# Deploy

Three parts: the hosted Supabase project (database, auth, realtime, storage), the API on Render
(one instance, because each room's conductor lives in memory) and the web app on Vercel.
Do them in this order. Nothing here costs money on the free tiers except a paid model key.

## 1. Supabase (hosted project)

1. Dashboard > Project Settings > API Keys: copy the **secret key** (`sb_secret_...`) into
   `.env.production.local` as `SUPABASE_SERVICE_ROLE_KEY`. Never commit that file.
2. Apply the schema: `npm run db:push:prod -- --dry-run`, check the list, then
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

## 3. Web on Vercel

1. Import the repository; `vercel.json` sets the install, build and output and the SPA rewrite
   (so `/r/<code>` links work).
2. Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (the publishable key),
   `VITE_API_URL` (the Render URL).
3. Put the Vercel URL back into Supabase (Site URL, redirects) and Render (`WEB_URL`).

## 4. Check it

- `SMOKE_ENV=.env.production.local npm run smoke` against the deployed API.
- Sign up on the site, start a class, join from a phone by QR, run a short class.
