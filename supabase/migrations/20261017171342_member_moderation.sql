-- Host moderation (B6): mute (cannot ask) and kick (cannot rejoin, loses read access).
-- Rooms stay capped at 5 seats (rooms.seats check in live_core; join enforces it).

alter table public.room_members
  add column muted boolean not null default false,
  add column banned boolean not null default false;

-- banned members lose read access to the room and stop receiving its broadcasts
create or replace function public.is_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members m
    where m.room_id = p_room and m.user_id = auth.uid() and not m.banned
  );
$$;
