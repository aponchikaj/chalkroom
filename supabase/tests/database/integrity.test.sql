-- Integrity: signup with a username taken in another case, gap-free event numbers, vote
-- toggles, course visibility, one-row-per-thing constraints, leases of deleted rooms, indexes.
-- Run: npm run test:db
begin;
select plan(16);

-- signup: a username someone already holds in capitals gets a suffix instead of failing
insert into auth.users (id, email, raw_user_meta_data) values ('d1000000-0000-4000-8000-000000000001', 'first@example.com', '{"username": "mixedcase"}');
update public.profiles set username = 'MIXEDCASE' where id = 'd1000000-0000-4000-8000-000000000001';
select lives_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data) values ('d1000000-0000-4000-8000-000000000002', 'second@example.com', '{"username": "mixedcase"}') $$,
  'signup does not fail when the name is taken in another case'
);
select is((select username::text from public.profiles where id = 'd1000000-0000-4000-8000-000000000002'), 'mixedcase1', 'and gets the next free name');

-- a room with a main stream
insert into public.rooms (id, title, host_id, invite_code) values ('d2000000-0000-4000-8000-000000000001', 'Integrity', 'd1000000-0000-4000-8000-000000000001', 'INTEG1');
insert into public.streams (id, room_id, kind) values ('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'main');
insert into public.room_members (room_id, user_id, role, display_name, color) values
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'host', 'First', '#f2d16b'),
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'learner', 'Second', '#8fc7e8');

-- append_event numbers events 1, 2, 3 with no gap and keeps last_seq in step
select public.append_event('d3000000-0000-4000-8000-000000000001', 'notice', '{"text": "a", "level": "info"}', 'system');
select public.append_event('d3000000-0000-4000-8000-000000000001', 'notice', '{"text": "b", "level": "info"}', 'system');
select public.append_event('d3000000-0000-4000-8000-000000000001', 'notice', '{"text": "c", "level": "info"}', 'system');
select results_eq($$ select seq from public.events where stream_id = 'd3000000-0000-4000-8000-000000000001' order by seq $$, $$ values (1::bigint), (2::bigint), (3::bigint) $$, 'append_event numbers events without gaps');
select is((select last_seq from public.streams where id = 'd3000000-0000-4000-8000-000000000001'), 3::bigint, 'last_seq follows');
set local role authenticated;
select throws_ok($$ select public.append_event('d3000000-0000-4000-8000-000000000001', 'notice', '{}', 'x') $$, '42501', null, 'clients cannot append events');
reset role;

-- toggle_vote: first call counts the vote, second takes it back
insert into public.questions (id, room_id, author_id, author_name, text) values ('d4000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'First', 'Why?');
select is(public.toggle_vote('d4000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002'), 1, 'a vote counts');
select is(public.toggle_vote('d4000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002'), 0, 'voting again takes it back');

-- courses: a private course and its ratings stay with the owner
insert into public.courses (id, title, visibility, owner_id) values ('d5000000-0000-4000-8000-000000000001', 'Private', 'private', 'd1000000-0000-4000-8000-000000000001');
insert into public.course_ratings (course_id, user_id, stars) values ('d5000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 5);
set local role authenticated;
set local request.jwt.claims = '{"sub": "d1000000-0000-4000-8000-000000000002", "role": "authenticated"}';
select is((select count(*)::int from public.courses where id = 'd5000000-0000-4000-8000-000000000001'), 0, 'others cannot read a private course');
select is((select count(*)::int from public.course_ratings where course_id = 'd5000000-0000-4000-8000-000000000001'), 0, 'nor its ratings');
reset role;

-- one row per thing
insert into public.note_blocks (room_id, idx, markdown) values ('d2000000-0000-4000-8000-000000000001', 0, 'first');
select throws_ok($$ insert into public.note_blocks (room_id, idx, markdown) values ('d2000000-0000-4000-8000-000000000001', 0, 'again') $$, '23505', null, 'one note block per position');
insert into public.cards (room_id, front, back, status) values ('d2000000-0000-4000-8000-000000000001', 'What is a PDA?', 'x', 'active');
select throws_ok($$ insert into public.cards (room_id, front, back, status) values ('d2000000-0000-4000-8000-000000000001', 'What is a PDA?', 'y', 'active') $$, '23505', null, 'one card per front in a deck');
insert into public.faq (course_id, question, answer) values ('d5000000-0000-4000-8000-000000000001', 'Why 255?', 'a');
select throws_ok($$ insert into public.faq (course_id, question, answer) values ('d5000000-0000-4000-8000-000000000001', 'why 255?', 'b') $$, '23505', null, 'one FAQ row per question in a course');
insert into public.streams (id, room_id, kind) values ('d3000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000001', 'thread'), ('d3000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000001', 'thread');
insert into public.threads (room_id, owner_id, stream_id, topic, status) values ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000002', 'one', 'offered');
select throws_ok($$ insert into public.threads (room_id, owner_id, stream_id, topic, status) values ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000003', 'two', 'offered') $$, '23505', null, 'one thread offer per learner at a time');

-- leases: a deleted room is skipped, not an error that stops the whole heartbeat
select is(public.take_room_lease('d9999999-0000-4000-8000-000000000000', 'qa/x'), false, 'no lease for a room that does not exist');
select set_eq(
  $$ select public.take_room_leases(array['d2000000-0000-4000-8000-000000000001', 'd9999999-0000-4000-8000-000000000000']::uuid[], 'qa/x') $$,
  $$ values ('d2000000-0000-4000-8000-000000000001'::uuid) $$,
  'the heartbeat keeps the rooms that exist'
);

-- foreign keys used for lookups and cascades have an index
select is(
  (select count(*)::int from (values
     ('cards', 'room_id'), ('cards', 'course_id'), ('checks', 'room_id'), ('course_ratings', 'user_id'),
     ('threads', 'stream_id'), ('rooms', 'main_stream_id'), ('rooms', 'next_room_id'), ('courses', 'forked_from'), ('note_blocks', 'edited_by')
   ) v(t, c)
   where not exists (
     select 1 from pg_index i
     join pg_class tc on tc.oid = i.indrelid
     join pg_namespace n on n.oid = tc.relnamespace and n.nspname = 'public'
     join pg_attribute a on a.attrelid = tc.oid and a.attnum = i.indkey[0]
     where tc.relname = v.t and a.attname = v.c and i.indpred is null
   )),
  0,
  'every foreign key used for lookups and cascades leads an index'
);

select * from finish();
rollback;
