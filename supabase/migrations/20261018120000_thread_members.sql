-- Lane Q: classmates who join a thread from a peek. They may post in it; the owner stays the
-- only one who can close or share it. ThreadRow.members in @chalk/schema is string[].
alter table public.threads add column if not exists members uuid[] not null default '{}';
