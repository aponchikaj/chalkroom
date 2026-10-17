-- Retrieval: source rules, hybrid search, scope and access.
-- Run: npm run test:db
begin;
select plan(13);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'host@example.com'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'stranger@example.com');
insert into public.rooms (id, title, host_id, invite_code)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Test room', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'TEST02');
insert into public.room_members (room_id, user_id, role, display_name, color)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'host', 'Host', '#f2d16b');

-- source rules
select throws_ok($$ insert into public.sources (kind, title) values ('faq', 'no scope') $$, '23514', null, 'a source needs a course or a room');
select throws_ok($$ insert into public.sources (room_id, kind, title, uri) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'url', 'bad', 'ftp://x') $$, '23514', null, 'url sources need http(s)');

-- one room source (ready) and one course source from the seed course (ready), one pending
insert into public.sources (id, room_id, kind, title, uri, status) values
  ('10000000-0000-4000-8000-000000000001', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'file', 'PDA handout', 'room/handout.pdf', 'ready'),
  ('10000000-0000-4000-8000-000000000003', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'file', 'Not processed yet', 'room/later.pdf', 'pending');
insert into public.sources (id, course_id, kind, title, status) values
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'syllabus', 'Course syllabus', 'ready');

-- embeddings: unit vectors along different axes so cosine ranking is predictable
insert into public.chunks (source_id, idx, page, heading, content, token_count, embedding) values
  ('10000000-0000-4000-8000-000000000001', 0, 3, 'Signing', 'A program signs for its PDA with invoke_signed and the seeds.', 14,
    ('[1' || repeat(',0', 1023) || ']')::extensions.vector),
  ('10000000-0000-4000-8000-000000000001', 1, 4, 'Bumps', 'find_program_address starts at bump 255 and counts down.', 12,
    ('[0,1' || repeat(',0', 1022) || ']')::extensions.vector),
  ('10000000-0000-4000-8000-000000000002', 0, null, 'Syllabus', 'Program Derived Addresses come after the accounts model.', 10, null),
  ('10000000-0000-4000-8000-000000000003', 0, 1, 'Hidden', 'invoke_signed text in a pending source must not match.', 10, null);

-- full text only (no embedding)
select is(
  (select array_agg(page order by score desc) from public.match_chunks('invoke_signed', null, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', null, 8)),
  array[3],
  'full-text search finds the signing chunk, never a pending source'
);

-- vector only (no keyword overlap): the nearest embedding wins
select is(
  (select page from public.match_chunks('zzz', ('[0,1' || repeat(',0', 1022) || ']')::extensions.vector, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', null, 1)),
  4,
  'vector search ranks the closest chunk first'
);

-- hybrid: both rankings agree on page 3
select is(
  (select page from public.match_chunks('invoke_signed seeds', ('[1' || repeat(',0', 1023) || ']')::extensions.vector, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', null, 1)),
  3,
  'hybrid search fuses both rankings'
);

-- scope: room plus its course
select is(
  (select count(*)::int from public.match_chunks('program', null, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-4000-8000-000000000001', 8)),
  3,
  'room and course sources are both searched (program also matches find_program_address)'
);
select is(
  (select count(*)::int from public.match_chunks('program', null, null, '00000000-0000-4000-8000-000000000001', 8)),
  1,
  'course scope alone excludes room material'
);

-- access: members read room sources, strangers do not; clients cannot call match_chunks
set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}';
select is((select count(*)::int from public.chunks where source_id = '10000000-0000-4000-8000-000000000001'), 2, 'members read their room''s chunks');
set local request.jwt.claims = '{"sub": "ffffffff-ffff-4fff-8fff-ffffffffffff", "role": "authenticated"}';
select is((select count(*)::int from public.sources where room_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 0, 'strangers see no room sources');
select throws_ok($$ select * from public.match_chunks('x', null, null, null, 1) $$, '42501', null, 'clients cannot call match_chunks');
reset role;

-- claim_source(): the oldest pending source, once
insert into public.sources (id, room_id, kind, title, uri, status, created_at) values
  ('10000000-0000-4000-8000-000000000009', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'file', 'Old', 'room/old.pdf', 'pending', now() - interval '1 hour');
select is((select id from public.claim_source()), '10000000-0000-4000-8000-000000000009'::uuid, 'claims the oldest pending source');
select is((select status from public.sources where id = '10000000-0000-4000-8000-000000000009'), 'processing', 'and marks it processing');
set local role authenticated;
select throws_ok($$ select * from public.claim_source() $$, '42501', null, 'clients cannot claim sources');
reset role;

select * from finish();
rollback;
