-- Two-factor authentication (B11).
--   * Authenticator app (TOTP): Supabase Auth MFA. A verified factor raises the session to
--     aal2 in the JWT (`aal` claim).
--   * Email codes: our own flow. The API emails a 6-digit code, stores only its hash in
--     email_otp_codes, and on success records the session in mfa_sessions.
-- mfa_satisfied() is the single rule: a user who turned on any second factor must have passed
-- it in this session. is_member() requires it, so RLS reads and realtime delivery are gated
-- too, not only the API. All tables here are written by the API (service role) only.

-- ---------------------------------------------------------------------------
-- Per-user security settings
-- ---------------------------------------------------------------------------

create table public.user_security (
  user_id uuid primary key references auth.users on delete cascade,
  email_2fa_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger user_security_updated_at before update on public.user_security
  for each row execute function public.set_updated_at();

alter table public.user_security enable row level security;
create policy "own security settings" on public.user_security for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Email one-time codes (hash only; 10 min, 5 attempts, single use: enforced by the API)
-- ---------------------------------------------------------------------------

create table public.email_otp_codes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  purpose text not null check (purpose in ('login', 'enable', 'disable')),
  -- HMAC-SHA256 of the code with a server secret, hex
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  attempts int not null default 0 check (attempts between 0 and 10),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
-- latest open code per user and purpose; also the rate-limit count of recent sends
create index email_otp_codes_user_recent on public.email_otp_codes (user_id, purpose, created_at desc);

alter table public.email_otp_codes enable row level security; -- no policies: API only

-- ---------------------------------------------------------------------------
-- Sessions that passed email 2FA (keyed by the JWT session_id claim)
-- ---------------------------------------------------------------------------

create table public.mfa_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  method text not null check (method in ('email')),
  verified_at timestamptz not null default now()
);
create index mfa_sessions_user on public.mfa_sessions (user_id);

alter table public.mfa_sessions enable row level security; -- no policies: API only

-- ---------------------------------------------------------------------------
-- The rule
-- ---------------------------------------------------------------------------

create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or (
      -- no verified authenticator and email 2FA off: nothing to satisfy
      not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
      and not exists (select 1 from public.user_security s where s.user_id = auth.uid() and s.email_2fa_enabled)
    )
    or exists (
      select 1 from public.mfa_sessions m
      where m.user_id = auth.uid()
        and m.session_id::text = auth.jwt() ->> 'session_id'
    );
$$;

-- is_member: membership, not banned (member_moderation), and 2FA passed when required
create or replace function public.is_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.mfa_satisfied() and exists (
    select 1 from public.room_members m
    where m.room_id = p_room and m.user_id = auth.uid() and not m.banned
  );
$$;
