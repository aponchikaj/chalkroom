-- Meaning-based search (B12): local multilingual embeddings (multilingual-e5-small, 384
-- dimensions, runs in the API with no key). Every embedding was still null (full-text only), so
-- the column changes type without converting data; match_chunks() takes the new size and
-- weights keyword ranks at half (packages/api/eval/retrieval.ts).
drop index if exists public.chunks_embedding;
update public.chunks set embedding = null;
alter table public.chunks alter column embedding type extensions.vector(384) using null;
create index chunks_embedding on public.chunks using hnsw (embedding extensions.vector_cosine_ops);

drop function if exists public.match_chunks(text, extensions.vector, uuid, uuid, int);
create or replace function public.match_chunks(
  p_query text,
  p_embedding extensions.vector(384),
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
  -- exact distances over the room's own chunks: the HNSW index would search the whole corpus
  -- first and filter after, leaving a small room with few or no vector hits
  scoped as materialized (
    select c.id, c.embedding <=> p_embedding as d
    from public.chunks c
    where p_embedding is not null and c.embedding is not null and c.source_id in (select id from scope)
  ),
  vec as (
    select id, row_number() over (order by d) as r from scoped order by d limit 50
  ),
  fused as (
    select coalesce(fts.id, vec.id) as id,
           -- keyword ranks count half: the OR query matches common words too (eval: hit@1 90% -> 95%)
           0.5 * coalesce(1.0 / (60 + fts.r), 0) + coalesce(1.0 / (60 + vec.r), 0) as score
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
