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

-- 4. Room lease: taken only when free, already ours, or its owner stopped heartbeating (30 s).
--    Returns whether this instance holds it now.
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
      where l.conductor_id = excluded.conductor_id or l.seen_at < now() - interval '30 seconds'
    returning 1
  )
  select exists (select 1 from t);
$$;

revoke execute on function public.take_room_lease(uuid, text) from public, anon, authenticated;
grant execute on function public.take_room_lease(uuid, text) to service_role;

-- 5. Indexes for hot paths and for foreign keys that cascade on account deletion.
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
