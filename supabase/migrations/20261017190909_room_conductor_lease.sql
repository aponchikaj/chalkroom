-- Room conductor lease: which API instance drives a room. The instance that serves a room takes
-- the lease and heartbeats it; at boot an instance resumes only its own rooms or rooms whose
-- owner stopped heartbeating (30 s), so two instances never drive the same room (rolling
-- restarts in production, a dev API next to a test API locally). Its own table: heartbeats
-- must not broadcast `rooms` rows to every client.
create table public.room_leases (
  room_id uuid primary key references public.rooms on delete cascade,
  conductor_id text not null,
  seen_at timestamptz not null default now()
);
alter table public.room_leases enable row level security; -- no policies: API only

-- live rooms this instance may resume
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
    and (l.room_id is null or l.conductor_id = p_instance or l.seen_at < now() - interval '30 seconds');
$$;

revoke execute on function public.resumable_rooms(text) from public, anon, authenticated;
grant execute on function public.resumable_rooms(text) to service_role;
