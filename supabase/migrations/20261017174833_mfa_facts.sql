-- The API's view of a user's second factors, in one round trip (B11). AuthGuard calls this on
-- every request so a newly verified factor takes effect at once; the decision itself is
-- mfaPassed() in packages/api/src/security/mfa.ts, the same rule as mfa_satisfied().
create or replace function public.mfa_facts(p_user uuid, p_session uuid)
returns table (totp_verified boolean, email_2fa boolean, session_passed_email boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (select 1 from auth.mfa_factors f where f.user_id = p_user and f.factor_type = 'totp' and f.status = 'verified'),
    coalesce((select s.email_2fa_enabled from public.user_security s where s.user_id = p_user), false),
    p_session is not null and exists (select 1 from public.mfa_sessions m where m.user_id = p_user and m.session_id = p_session);
$$;

revoke execute on function public.mfa_facts(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mfa_facts(uuid, uuid) to service_role;
