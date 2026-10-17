-- Retrieval (B12): what the tutors can look things up in.
--   sources: one uploaded file, web page, syllabus, notes, FAQ or class transcript, scoped to a
--            course (reused by every class of it) or a room (this class only).
--   chunks:  ~500-token passages of a source with a page number, a full-text vector (works with
--            no embedding provider: demo insurance) and an optional embedding (pgvector).
--   match_chunks(): hybrid search, full text + vector, merged by reciprocal rank fusion.
-- Only the API writes (service role). Members read what their room or course can see, so the
-- web can render citations (`source: "res:<source id>#p<page>"` in Board Script).
-- Embedding size 1024 matches the planned provider (Voyage voyage-3.5 family); changing models
-- to another size is a new migration.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Who may read a course's material
-- ---------------------------------------------------------------------------

create or replace function public.can_read_course(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course and (c.visibility = 'public' or c.owner_id = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- sources
-- ---------------------------------------------------------------------------

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses on delete cascade,
  room_id uuid references public.rooms on delete cascade,
  kind text not null check (kind in ('file', 'url', 'syllabus', 'notes', 'faq', 'transcript')),
  title text not null check (char_length(title) between 1 and 200),
  -- file: object key in the `resources` bucket; url: the http(s) URL; others: null
  uri text,
  mime text,
  -- sha256 of the content, hex: re-uploading the same file is a no-op
  checksum text check (checksum is null or checksum ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  error text,
  page_count int check (page_count is null or page_count >= 0),
  chunk_count int not null default 0 check (chunk_count >= 0),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_scope check (course_id is not null or room_id is not null),
  constraint sources_uri check (
    (kind = 'file' and uri is not null)
    or (kind = 'url' and uri ~ '^https?://')
    or kind in ('syllabus', 'notes', 'faq', 'transcript')
  )
);
create index sources_course on public.sources (course_id) where course_id is not null;
create index sources_room on public.sources (room_id) where room_id is not null;
create index sources_created_by on public.sources (created_by);
-- the ingest worker's queue
create index sources_queue on public.sources (created_at) where status in ('pending', 'processing');
create unique index sources_dedupe on public.sources (
  coalesce(course_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(room_id, '00000000-0000-0000-0000-000000000000'::uuid),
  checksum
) where checksum is not null;

create trigger sources_updated_at before update on public.sources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- chunks
-- ---------------------------------------------------------------------------

create table public.chunks (
  id bigint generated always as identity primary key,
  source_id uuid not null references public.sources on delete cascade,
  idx int not null check (idx >= 0),
  page int check (page is null or page >= 1),
  heading text not null default '',
  content text not null check (char_length(content) between 1 and 20000),
  token_count int not null check (token_count >= 0),
  embedding extensions.vector(1024),
  -- 'simple' config: language-agnostic keywords (lessons may be in English or Georgian);
  -- meaning comes from the embedding
  tsv tsvector generated always as (to_tsvector('simple', heading || ' ' || content)) stored,
  created_at timestamptz not null default now(),
  unique (source_id, idx)
);
create index chunks_tsv on public.chunks using gin (tsv);
create index chunks_embedding on public.chunks using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- RLS: read what your room or course can see
-- ---------------------------------------------------------------------------

alter table public.sources enable row level security;
alter table public.chunks enable row level security;

create policy "read room or course sources" on public.sources for select to authenticated using (
  (room_id is not null and public.is_member(room_id))
  or (course_id is not null and public.can_read_course(course_id))
);
create policy "read chunks of readable sources" on public.chunks for select to authenticated using (
  exists (select 1 from public.sources s where s.id = source_id)
);

-- ---------------------------------------------------------------------------
-- Hybrid search (service role only)
-- ---------------------------------------------------------------------------

-- Ready chunks of the room's sources plus its course's sources. p_embedding may be null:
-- then it is full-text only. Score = sum of 1 / (60 + rank) over both rankings.
create or replace function public.match_chunks(
  p_query text,
  p_embedding extensions.vector(1024),
  p_room uuid,
  p_course uuid,
  p_k int default 8
)
returns table (chunk_id bigint, source_id uuid, kind text, title text, page int, heading text, content text, score double precision)
language sql
stable
set search_path = public, extensions
as $$
  with scope as (
    select s.id from public.sources s
    where s.status = 'ready'
      and ((p_room is not null and s.room_id = p_room) or (p_course is not null and s.course_id = p_course))
  ),
  q as (select websearch_to_tsquery('simple', coalesce(p_query, '')) as tsq),
  fts as (
    select c.id, row_number() over (order by ts_rank_cd(c.tsv, q.tsq) desc) as r
    from public.chunks c, q
    where c.source_id in (select id from scope) and c.tsv @@ q.tsq
    order by ts_rank_cd(c.tsv, q.tsq) desc
    limit 50
  ),
  vec as (
    select c.id, row_number() over (order by c.embedding <=> p_embedding) as r
    from public.chunks c
    where p_embedding is not null and c.embedding is not null and c.source_id in (select id from scope)
    order by c.embedding <=> p_embedding
    limit 50
  ),
  fused as (
    select coalesce(fts.id, vec.id) as id,
           coalesce(1.0 / (60 + fts.r), 0) + coalesce(1.0 / (60 + vec.r), 0) as score
    from fts full join vec on fts.id = vec.id
  )
  select c.id, s.id, s.kind, s.title, c.page, c.heading, c.content, f.score::double precision
  from fused f
  join public.chunks c on c.id = f.id
  join public.sources s on s.id = c.source_id
  order by f.score desc
  limit greatest(1, least(p_k, 50));
$$;

revoke execute on function public.match_chunks(text, extensions.vector, uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.match_chunks(text, extensions.vector, uuid, uuid, int) to service_role;

-- ---------------------------------------------------------------------------
-- Resources bucket: private, 50 MiB, documents. The API reads and writes with the service role.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resources', 'resources', false, 52428800, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown'
])
on conflict (id) do nothing;
