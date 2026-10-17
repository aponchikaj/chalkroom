-- Lane L: the replay library and recurring study groups.
--   rooms.next_room_id: "Book the next session" created this follow-up room.
--   rooms.starts_at is added by lane C (20261018100000); repeated here only if it is missing.
-- Only the API writes (service role); replays of public rooms are served by the API, so the
-- events policies stay as they are.

alter table public.rooms add column if not exists starts_at timestamptz;
alter table public.rooms add column if not exists next_room_id uuid references public.rooms (id) on delete set null;

-- the replay library: finished public rooms, newest first
create index if not exists rooms_replays on public.rooms (ended_at desc) where visibility = 'public' and phase = 'ended';
-- kudos: my questions and my threads across every room
create index if not exists questions_author on public.questions (author_id);
create index if not exists threads_owner on public.threads (owner_id);
