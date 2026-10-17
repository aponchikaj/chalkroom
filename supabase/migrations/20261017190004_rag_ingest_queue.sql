-- RAG ingest queue (B12): an API instance claims the oldest pending source; `skip locked` lets
-- several instances work the queue without taking the same source twice. A source left in
-- `processing` by a crashed instance goes back to `pending` after 10 minutes.
create or replace function public.claim_source()
returns setof public.sources
language sql
security definer
set search_path = public
as $$
  update public.sources set status = 'pending'
  where status = 'processing' and updated_at < now() - interval '10 minutes';

  update public.sources set status = 'processing'
  where id = (
    select id from public.sources
    where status = 'pending'
    order by created_at
    for update skip locked
    limit 1
  )
  returning *;
$$;

revoke execute on function public.claim_source() from public, anon, authenticated;
grant execute on function public.claim_source() to service_role;
