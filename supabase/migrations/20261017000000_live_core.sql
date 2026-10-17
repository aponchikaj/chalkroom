-- Chalkroom Live: core schema.
-- Rules this schema enforces:
--   * Boards are append-only event logs with one writer (the API, service role).
--   * `seq` is gap-free per stream: append_event() bumps streams.last_seq and inserts in one tx.
--   * Every committed insert/update is broadcast on the private channel `room:{room_id}`.
--   * Members can READ their room; only the service role WRITES (clients go through the API).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  color text not null default '#f2d16b',
  created_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  goal text not null default '',
  syllabus_md text not null default '',
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  owner_id uuid references auth.users on delete set null,
  forked_from uuid references public.courses on delete set null,
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses on delete set null,
  topic_id text,
  title text not null,
  goal text not null default '',
  host_id uuid not null references auth.users,
  phase text not null default 'lobby' check (phase in ('lobby', 'teaching', 'check', 'qa', 'ended')),
  segment int not null default 0,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  seats int not null default 5 check (seats between 1 and 5),
  invite_code text not null unique,
  lesson_plan jsonb,
  main_stream_id uuid,
  gate_deadline timestamptz,
  gate_held boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

create table public.room_members (
  room_id uuid not null references public.rooms on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'learner' check (role in ('host', 'learner')),
  display_name text not null,
  color text not null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id, user_id)
);

create table public.streams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  kind text not null check (kind in ('main', 'thread')),
  last_seq bigint not null default 0
);
create index on public.streams (room_id);

alter table public.rooms
  add constraint rooms_main_stream_fk foreign key (main_stream_id) references public.streams (id) on delete set null;

create table public.events (
  stream_id uuid not null references public.streams on delete cascade,
  room_id uuid not null references public.rooms on delete cascade,
  seq bigint not null,
  kind text not null,
  data jsonb not null,
  actor text not null,
  t timestamptz not null default now(),
  primary key (stream_id, seq)
);
create index on public.events (room_id);

create table public.threads (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  owner_id uuid not null references auth.users on delete cascade,
  stream_id uuid not null references public.streams on delete cascade,
  topic text not null,
  status text not null default 'offered' check (status in ('offered', 'open', 'closed')),
  shared_answer text,
  left_main_seq bigint,
  created_at timestamptz not null default now()
);
create index on public.threads (room_id);
-- one active thread per learner per room
create unique index threads_one_active on public.threads (room_id, owner_id) where status = 'open';

create table public.clusters (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  title text not null,
  route text check (route in ('class', 'later', 'inline', 'thread')),
  reason text,
  target_segment int,
  answer text,
  answered boolean not null default false,
  asker_count int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.clusters (room_id);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  author_id uuid not null references auth.users on delete cascade,
  author_name text not null,
  text text not null,
  anchor jsonb,
  segment int not null default 0,
  cluster_id uuid references public.clusters on delete set null,
  status text not null default 'pending' check (status in ('pending', 'grouped', 'later', 'answered', 'thread', 'flagged')),
  votes int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.questions (room_id);

-- +1s are anonymous: not readable by members, only the count on questions.votes is.
create table public.votes (
  question_id uuid not null references public.questions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  primary key (question_id, user_id)
);

-- Full check incl. the answer. Members never read this table; they get PublicQuestion via events.
create table public.checks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  segment int not null,
  question jsonb not null,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.check_answers (
  check_id uuid not null references public.checks on delete cascade,
  room_id uuid not null references public.rooms on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  answer jsonb,
  correct boolean,
  created_at timestamptz not null default now(),
  primary key (check_id, user_id)
);

create table public.ready_votes (
  room_id uuid not null references public.rooms on delete cascade,
  segment int not null,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, segment, user_id)
);

create table public.reactions (
  room_id uuid not null references public.rooms on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  shape_id text not null,
  kind text not null check (kind in ('confused', 'got_it')),
  created_at timestamptz not null default now(),
  primary key (room_id, user_id, shape_id)
);

create table public.note_blocks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  idx int not null,
  markdown text not null default '',
  edited_by uuid references auth.users on delete set null,
  version int not null default 1,
  updated_at timestamptz not null default now()
);
create index on public.note_blocks (room_id);

create table public.faq (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses on delete cascade,
  topic_id text,
  question text not null,
  answer text not null,
  askers_total int not null default 0,
  created_at timestamptz not null default now()
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms on delete cascade,
  course_id uuid references public.courses on delete cascade,
  front text not null,
  back text not null default '',
  status text not null default 'proposed' check (status in ('proposed', 'active', 'suspended')),
  created_at timestamptz not null default now()
);

create table public.card_reviews (
  card_id uuid not null references public.cards on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  fsrs jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (card_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Gap-free append (service role only)
-- ---------------------------------------------------------------------------

create or replace function public.append_event(p_stream uuid, p_kind text, p_data jsonb, p_actor text)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq bigint;
  v_room uuid;
  v_ev public.events;
begin
  -- the row lock on streams serialises concurrent appends to the same stream
  update public.streams set last_seq = last_seq + 1 where id = p_stream returning last_seq, room_id into v_seq, v_room;
  if not found then
    raise exception 'unknown stream %', p_stream;
  end if;
  insert into public.events (stream_id, room_id, seq, kind, data, actor)
  values (p_stream, v_room, v_seq, p_kind, p_data, p_actor)
  returning * into v_ev;
  return v_ev;
end;
$$;

revoke execute on function public.append_event(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.append_event(uuid, text, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- Broadcast from Database: committed rows go to `room:{room_id}`
-- ---------------------------------------------------------------------------

create or replace function public.broadcast_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.send(to_jsonb(new), 'event', 'room:' || new.room_id::text, true);
  return null;
end;
$$;

create trigger events_broadcast after insert on public.events
  for each row execute function public.broadcast_event();

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
  -- never leak answers or anonymous data
  if tg_table_name = 'check_answers' then
    v_row := v_row - 'answer';
  end if;
  perform realtime.send(
    jsonb_build_object('table', tg_table_name, 'op', tg_op, 'row', v_row),
    'row', 'room:' || v_room, true);
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['rooms', 'room_members', 'questions', 'clusters', 'threads', 'ready_votes', 'check_answers', 'reactions', 'note_blocks']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.broadcast_row()', t || '_broadcast', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security: members read their room, nobody but the service role writes
-- ---------------------------------------------------------------------------

create or replace function public.is_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- members who left can still read, so a rejoin replays from lastSeq
  select exists (select 1 from public.room_members m where m.room_id = p_room and m.user_id = auth.uid());
$$;

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.streams enable row level security;
alter table public.events enable row level security;
alter table public.threads enable row level security;
alter table public.clusters enable row level security;
alter table public.questions enable row level security;
alter table public.votes enable row level security;
alter table public.checks enable row level security;
alter table public.check_answers enable row level security;
alter table public.ready_votes enable row level security;
alter table public.reactions enable row level security;
alter table public.note_blocks enable row level security;
alter table public.faq enable row level security;
alter table public.cards enable row level security;
alter table public.card_reviews enable row level security;

create policy "own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "public courses" on public.courses for select to authenticated using (visibility = 'public' or owner_id = auth.uid());
create policy "faq readable" on public.faq for select to authenticated using (true);

create policy "members read room" on public.rooms for select to authenticated using (public.is_member(id));
create policy "members read members" on public.room_members for select to authenticated using (public.is_member(room_id));
create policy "members read streams" on public.streams for select to authenticated using (public.is_member(room_id));
create policy "members read events" on public.events for select to authenticated using (public.is_member(room_id));
create policy "members read threads" on public.threads for select to authenticated using (public.is_member(room_id));
create policy "members read clusters" on public.clusters for select to authenticated using (public.is_member(room_id));
create policy "members read questions" on public.questions for select to authenticated using (public.is_member(room_id));
create policy "members read ready" on public.ready_votes for select to authenticated using (public.is_member(room_id));
create policy "members read reactions" on public.reactions for select to authenticated using (public.is_member(room_id));
create policy "members read notes" on public.note_blocks for select to authenticated using (public.is_member(room_id));
create policy "members read cards" on public.cards for select to authenticated using (room_id is not null and public.is_member(room_id));
create policy "own card reviews" on public.card_reviews for select to authenticated using (user_id = auth.uid());
-- check_answers: you see your own answer; the spread arrives in the check_closed event
create policy "own check answers" on public.check_answers for select to authenticated using (user_id = auth.uid());
-- votes and checks: no select policy on purpose (anonymous +1, hidden answers)

-- ---------------------------------------------------------------------------
-- Realtime authorization for private channels `room:{uuid}`
-- ---------------------------------------------------------------------------

create or replace function public.topic_room(p_topic text)
returns uuid
language sql
immutable
as $$
  select case when p_topic ~ '^room:[0-9a-f-]{36}$' then substring(p_topic from 6)::uuid end;
$$;

create policy "members receive room broadcasts" on realtime.messages for select to authenticated
  using (public.is_member(public.topic_room(realtime.topic())));

-- presence + client-to-client laser pointer. Clients may NOT send 'event' or 'row' broadcasts,
-- so nobody can spoof board events: those only come from the DB triggers above.
create policy "members send presence and laser" on realtime.messages for insert to authenticated
  with check (
    public.is_member(public.topic_room(realtime.topic()))
    and (realtime.messages.extension = 'presence'
         or (realtime.messages.extension = 'broadcast' and realtime.messages.event = 'laser'))
  );
