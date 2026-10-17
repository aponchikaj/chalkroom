-- Hardening from the backend review (2026-10-18): privacy of check results, an atomic seat
-- limit, atomic email-code attempts, an exclusive room lease, and indexes for hot queries.

-- 1. Row broadcasts of check answers carry neither the answer nor whether it was right: the
--    class learns the spread only from check_closed. The client needs check_id and user_id
--    ("I answered").
create or replace function public.broadcast_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_room text;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_room := case when tg_table_name = 'rooms' then v_row ->> 'id' else v_row ->> 'room_id' end;
  if tg_table_name = 'check_answers' then
    v_row := v_row - 'answer' - 'correct';
  end if;
  perform realtime.send(
    jsonb_build_object('table', tg_table_name, 'op', tg_op, 'row', v_row),
    'row', 'room:' || v_room, true);
  return null;
end;
$$;

-- 2. Seats: a member becoming active (join, rejoin, presence back) takes a seat only if one is
--    free. The room row is locked, so two joiners racing for the last seat are serialized.
create or replace function public.enforce_seats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seats int;
  v_active int;
begin
  if new.left_at is not null or new.banned then return new; end if;
  if tg_op = 'UPDATE' and old.left_at is null and not old.banned then return new; end if;
  select seats into v_seats from public.rooms where id = new.room_id for update;
  select count(*) into v_active from public.room_members
    where room_id = new.room_id and user_id <> new.user_id and left_at is null and not banned;
  if v_active >= v_seats then
    raise exception 'the room is full' using errcode = 'P0001', hint = 'room_full';
  end if;
  return new;
end;
$$;

create trigger room_members_seats before insert or update on public.room_members
  for each row execute function public.enforce_seats();

-- 3. Email codes: an attempt is counted before the code is compared, in one statement, so
--    parallel guesses cannot share one reading of the counter. Returns the code row when an
--    attempt was available (and counts it), nothing when the code is used, expired or locked.
create or replace function public.otp_attempt(p_id bigint, p_max int)
returns table (code_hash text, attempts int)
language sql
security definer
set search_path = public
as $$
  update public.email_otp_codes
     set attempts = attempts + 1
   where id = p_id and attempts < p_max and consumed_at is null and expires_at > now()
  returning code_hash, attempts;
$$;

revoke execute on function public.otp_attempt(bigint, int) from public, anon, authenticated;
grant execute on function public.otp_attempt(bigint, int) to service_role;

-- 4. Room lease: taken only when free, already ours, or its owner (in the same instance group)
--    stopped heartbeating (30 s). Returns whether this instance holds it now. An instance id is
--    "<group>/<host:port>"; ids without a group share the empty group. Groups keep a test API
--    from taking over the dev API's rooms and the other way round.
create or replace function public.lease_group(p_instance text)
returns text
language sql
immutable
as $$ select case when position('/' in p_instance) > 0 then split_part(p_instance, '/', 1) else '' end $$;

create or replace function public.take_room_lease(p_room uuid, p_instance text)
returns boolean
language sql
security definer
set search_path = public
as $$
  with t as (
    insert into public.room_leases as l (room_id, conductor_id, seen_at)
    values (p_room, p_instance, now())
    on conflict (room_id) do update set conductor_id = excluded.conductor_id, seen_at = now()
      where l.conductor_id = excluded.conductor_id
         or (l.seen_at < now() - interval '30 seconds' and public.lease_group(l.conductor_id) = public.lease_group(excluded.conductor_id))
    returning 1
  )
  select exists (select 1 from t);
$$;

revoke execute on function public.take_room_lease(uuid, text) from public, anon, authenticated;
grant execute on function public.take_room_lease(uuid, text) to service_role;

-- the heartbeat: refresh many leases in one call; returns the rooms this instance still holds
create or replace function public.take_room_leases(p_rooms uuid[], p_instance text)
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select r from unnest(p_rooms) r where public.take_room_lease(r, p_instance);
$$;

revoke execute on function public.take_room_leases(uuid[], text) from public, anon, authenticated;
grant execute on function public.take_room_leases(uuid[], text) to service_role;

-- live rooms this instance may take over: its own, abandoned ones of its group, unowned ones
create or replace function public.resumable_rooms(p_instance text)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.id from public.rooms r
  left join public.room_leases l on l.room_id = r.id
  where r.phase in ('teaching', 'check', 'qa')
    and (l.room_id is null or l.conductor_id = p_instance
         or (l.seen_at < now() - interval '30 seconds' and public.lease_group(l.conductor_id) = public.lease_group(p_instance)));
$$;

-- 5. Ingest queue: a source is claimed at most 3 times. One that keeps crashing the worker (it
--    sat in `processing` past the 10 minute timeout each time) fails instead of looping; the
--    worker refreshes updated_at while it works, so a slow ingest is not re-claimed.
alter table public.sources add column attempts int not null default 0;

create or replace function public.claim_source()
returns setof public.sources
language sql
security definer
set search_path = public
as $$
  update public.sources
     set status = case when attempts >= 3 then 'failed' else 'pending' end,
         error = case when attempts >= 3 then 'indexing kept failing; remove it and add it again' else error end
   where status = 'processing' and updated_at < now() - interval '10 minutes';

  update public.sources set status = 'processing', attempts = attempts + 1
  where id = (
    select id from public.sources
    where status = 'pending'
    order by created_at
    for update skip locked
    limit 1
  )
  returning *;
$$;

-- 6. Indexes for hot paths and for foreign keys that cascade on account deletion.
create index chunks_needs_embedding on public.chunks (id) where embedding is null;
create index questions_cluster on public.questions (cluster_id) where cluster_id is not null;
create index questions_author on public.questions (author_id);
create index checks_room_open on public.checks (room_id) where closed_at is null;
create index check_answers_room_user on public.check_answers (room_id, user_id);
create index check_answers_user on public.check_answers (user_id);
create index room_members_user on public.room_members (user_id);
create index rooms_course on public.rooms (course_id) where course_id is not null;
create index votes_user on public.votes (user_id);
create index ready_votes_user on public.ready_votes (user_id);
create index reactions_user on public.reactions (user_id);
create index threads_owner on public.threads (owner_id);
create index card_reviews_user on public.card_reviews (user_id);

-- 7. Row security computed once per query. is_member(room_id) is a SECURITY DEFINER function of
--    a column, so it ran once per returned row (a 1000-event replay: 1000 calls, each checking
--    the second factor and membership). my_room_ids() takes no column, so `room_id in (select
--    my_room_ids())` is evaluated once per statement. Same rule: member, not banned, second
--    factor passed.
create or replace function public.my_room_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.room_id from public.room_members m
  where m.user_id = auth.uid() and not m.banned and public.mfa_satisfied();
$$;

revoke execute on function public.my_room_ids() from public, anon;
grant execute on function public.my_room_ids() to authenticated, service_role;

alter policy "members read cards" on public.cards using (room_id is not null and room_id in (select public.my_room_ids()));
alter policy "members read clusters" on public.clusters using (room_id in (select public.my_room_ids()));
alter policy "members read events" on public.events using (room_id in (select public.my_room_ids()));
alter policy "members read notes" on public.note_blocks using (room_id in (select public.my_room_ids()));
alter policy "members read questions" on public.questions using (room_id in (select public.my_room_ids()));
alter policy "members read reactions" on public.reactions using (room_id in (select public.my_room_ids()));
alter policy "members read ready" on public.ready_votes using (room_id in (select public.my_room_ids()));
alter policy "members read members" on public.room_members using (room_id in (select public.my_room_ids()));
alter policy "members read room" on public.rooms using (id in (select public.my_room_ids()));
alter policy "members read streams" on public.streams using (room_id in (select public.my_room_ids()));
alter policy "members read threads" on public.threads using (room_id in (select public.my_room_ids()));
alter policy "read room or course sources" on public.sources using (
  (room_id is not null and room_id in (select public.my_room_ids()))
  or (course_id is not null and public.can_read_course(course_id)));

-- 8. Votes: toggle and recount in one transaction (the API did delete, insert, count and update
--    as four calls, so two toggles at once could store a stale count).
create or replace function public.toggle_vote(p_question uuid, p_user uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  perform 1 from public.questions where id = p_question for update;
  delete from public.votes where question_id = p_question and user_id = p_user;
  if not found then insert into public.votes (question_id, user_id) values (p_question, p_user); end if;
  select count(*) into v_count from public.votes where question_id = p_question;
  update public.questions set votes = v_count where id = p_question;
  return v_count;
end;
$$;

revoke execute on function public.toggle_vote(uuid, uuid) from public, anon, authenticated;
grant execute on function public.toggle_vote(uuid, uuid) to service_role;

-- 9. Email codes are issued under a per-user lock, so parallel sends cannot pass the hourly
--    limit. Returns false when the limit is reached.
create or replace function public.otp_issue(p_user uuid, p_purpose text, p_hash text, p_expires timestamptz, p_max int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('otp:' || p_user::text, 0));
  if (select count(*) from public.email_otp_codes where user_id = p_user and created_at > now() - interval '1 hour') >= p_max then
    return false;
  end if;
  insert into public.email_otp_codes (user_id, purpose, code_hash, expires_at) values (p_user, p_purpose, p_hash, p_expires);
  return true;
end;
$$;

revoke execute on function public.otp_issue(uuid, text, text, timestamptz, int) from public, anon, authenticated;
grant execute on function public.otp_issue(uuid, text, text, timestamptz, int) to service_role;

-- 10. The API's second-factor facts count any verified factor, the same rule as
--     mfa_satisfied() (only TOTP is enabled today, but the two must never disagree).
create or replace function public.mfa_facts(p_user uuid, p_session uuid)
returns table (totp_verified boolean, email_2fa boolean, session_passed_email boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (select 1 from auth.mfa_factors f where f.user_id = p_user and f.status = 'verified'),
    coalesce((select s.email_2fa_enabled from public.user_security s where s.user_id = p_user), false),
    p_session is not null and exists (select 1 from public.mfa_sessions m where m.user_id = p_user and m.session_id = p_session);
$$;

-- 11. Deleting an account no longer deletes the classes it hosted (with every learner's notes,
--     answers and cards): an ended room keeps its content and loses its host. Live rooms are
--     refused by the API before deletion.
alter table public.rooms alter column host_id drop not null;
alter table public.rooms drop constraint rooms_host_id_fkey;
alter table public.rooms add constraint rooms_host_id_fkey foreign key (host_id) references auth.users on delete set null;
