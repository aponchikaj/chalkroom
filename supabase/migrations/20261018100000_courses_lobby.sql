-- Lane C: courses catalog, ratings, the lobby of public rooms.
--   rooms.starts_at: planned start shown in the lobby (null: starts when the host says so).
--   course_ratings: one 1-5 star rating per user and course.
-- Only the API writes (service role). Signed-in users read public courses and their ratings;
-- owners read their private courses (existing policy "public courses") and those ratings.

alter table public.rooms add column if not exists starts_at timestamptz;
create index if not exists rooms_lobby on public.rooms (visibility, phase) where visibility = 'public';
create index if not exists rooms_course on public.rooms (course_id) where course_id is not null;
create index if not exists courses_owner on public.courses (owner_id);
create index if not exists faq_course on public.faq (course_id);

create table if not exists public.course_ratings (
  course_id uuid not null references public.courses on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  stars int not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, user_id)
);

alter table public.course_ratings enable row level security;

create policy "ratings of readable courses" on public.course_ratings for select to authenticated using (
  exists (
    select 1 from public.courses c
    where c.id = course_id and (c.visibility = 'public' or c.owner_id = auth.uid())
  )
);
