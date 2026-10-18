-- Integrity fixes from the backend review (2026-10-18). Safe to run again (if not exists).
-- Version 20261018140000: 20261018130000 is the tts bucket (server voice).
--   1. Signup: the username collision check is case-insensitive like the unique index, so a
--      name someone holds in capitals gets a suffix instead of failing the signup.
--   2. Room leases: a room that was deleted is skipped instead of failing the whole heartbeat.
--   3. One row per thing: note blocks per position, cards per front, FAQ rows per question,
--      one thread offer per learner. Existing duplicates are removed first.
--   4. Indexes on foreign keys used for lookups and cascades.

-- 1. Signup ------------------------------------------------------------------------------
-- With search_path = '' the citext `=` (schema extensions) is not found, so the comparison
-- fell back to text and was case-sensitive. Name the operator explicitly.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_base text;
  v_name text;
  v_try text;
  v_n int := 0;
begin
  v_base := lower(regexp_replace(coalesce(nullif(v_meta ->> 'username', ''), split_part(coalesce(new.email, ''), '@', 1), ''), '[^a-zA-Z0-9_]', '_', 'g'));
  v_base := substr(v_base, 1, 20);
  if char_length(v_base) < 3 then
    v_base := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  v_try := v_base;
  while exists (select 1 from public.profiles p where p.username operator(extensions.=) v_try::extensions.citext) loop
    v_n := v_n + 1;
    v_try := substr(v_base, 1, 20) || v_n::text;
  end loop;

  v_name := substr(coalesce(nullif(trim(v_meta ->> 'display_name'), ''), v_try), 1, 32);

  insert into public.profiles (id, username, display_name, color)
  values (
    new.id,
    v_try,
    v_name,
    case when coalesce(v_meta ->> 'color', '') ~ '^#[0-9a-fA-F]{6}$' then v_meta ->> 'color' else '#f2d16b' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 2. Room leases ---------------------------------------------------------------------------
create or replace function public.take_room_lease(p_room uuid, p_instance text)
returns boolean
language sql
security definer
set search_path = public
as $$
  with t as (
    insert into public.room_leases as l (room_id, conductor_id, seen_at)
    select p_room, p_instance, now()
    where exists (select 1 from public.rooms where id = p_room)
    on conflict (room_id) do update set conductor_id = excluded.conductor_id, seen_at = now()
      where l.conductor_id = excluded.conductor_id
         or (l.seen_at < now() - interval '30 seconds' and public.lease_group(l.conductor_id) = public.lease_group(excluded.conductor_id))
    returning 1
  )
  select exists (select 1 from t);
$$;

revoke execute on function public.take_room_lease(uuid, text) from public, anon, authenticated;
grant execute on function public.take_room_lease(uuid, text) to service_role;

-- 3. One row per thing ---------------------------------------------------------------------
-- note blocks: keep the most edited copy of each position
delete from public.note_blocks n
using public.note_blocks k
where n.room_id = k.room_id and n.idx = k.idx
  and (n.version, n.updated_at, n.id) < (k.version, k.updated_at, k.id);
create unique index if not exists note_blocks_room_idx on public.note_blocks (room_id, idx);

-- cards: keep the first card of each front in a deck (its reviews stay with it)
delete from public.cards c
using public.cards k
where c.room_id = k.room_id and c.front = k.front
  and (c.created_at, c.id) > (k.created_at, k.id);
create unique index if not exists cards_room_front on public.cards (room_id, front);

-- FAQ: one row per question in a course, in any case; keep the oldest and add up the askers
with dup as (
  select id, first_value(id) over w as keep, askers_total
  from public.faq
  window w as (partition by course_id, lower(question) order by created_at, id)
), totals as (
  select keep, sum(askers_total) as askers from dup group by keep having count(*) > 1
)
update public.faq f set askers_total = t.askers from totals t where f.id = t.keep;
delete from public.faq f
using public.faq k
where f.course_id = k.course_id and lower(f.question) = lower(k.question)
  and (f.created_at, f.id) > (k.created_at, k.id);
create unique index if not exists faq_course_question on public.faq (course_id, lower(question));

-- threads: one offer per learner per room at a time (the open one is threads_one_active)
update public.threads t set status = 'closed'
from public.threads k
where t.room_id = k.room_id and t.owner_id = k.owner_id and t.status = 'offered' and k.status = 'offered'
  and (t.created_at, t.id) > (k.created_at, k.id);
create unique index if not exists threads_one_offer on public.threads (room_id, owner_id) where status = 'offered';

-- 4. Foreign key indexes ---------------------------------------------------------------------
create index if not exists cards_course_id on public.cards (course_id);
create index if not exists checks_room_id on public.checks (room_id);
create index if not exists course_ratings_user_id on public.course_ratings (user_id);
create index if not exists threads_stream_id on public.threads (stream_id);
create index if not exists rooms_main_stream_id on public.rooms (main_stream_id);
create index if not exists rooms_next_room_id on public.rooms (next_room_id);
create index if not exists courses_forked_from on public.courses (forked_from);
create index if not exists note_blocks_edited_by on public.note_blocks (edited_by);
