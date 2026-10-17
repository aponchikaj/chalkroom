-- Hardening (20261017201838): exclusive room lease, the seat trigger, atomic email-code attempts.
-- Run: npm run test:db
begin;
select plan(13);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', 'h@example.com'),
  ('b0000000-0000-4000-8000-000000000001', 'b1@example.com'),
  ('b0000000-0000-4000-8000-000000000002', 'b2@example.com'),
  ('b0000000-0000-4000-8000-000000000003', 'b3@example.com');
insert into public.rooms (id, title, host_id, invite_code, phase, seats) values
  ('d0000000-0000-4000-8000-000000000001', 'lease', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', 'HARD01', 'teaching', 5),
  ('d0000000-0000-4000-8000-000000000002', 'two seats', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', 'HARD02', 'lobby', 2);

-- lease
select ok(public.take_room_lease('d0000000-0000-4000-8000-000000000001', 'api-a'), 'a free lease is taken');
select ok(public.take_room_lease('d0000000-0000-4000-8000-000000000001', 'api-a'), 'the owner refreshes it');
select ok(not public.take_room_lease('d0000000-0000-4000-8000-000000000001', 'api-b'), 'another instance cannot take a live lease');
update public.room_leases set seen_at = now() - interval '1 minute' where room_id = 'd0000000-0000-4000-8000-000000000001';
select ok(public.take_room_lease('d0000000-0000-4000-8000-000000000001', 'api-b'), 'a stale lease is taken over');
update public.room_leases set conductor_id = 'e2e/host:3101', seen_at = now() - interval '1 minute' where room_id = 'd0000000-0000-4000-8000-000000000001';
select ok(not public.take_room_lease('d0000000-0000-4000-8000-000000000001', 'main/host:3001'), 'never a stale lease of another group');
select ok(not exists (select 1 from public.resumable_rooms('main/host:3001') r where r = 'd0000000-0000-4000-8000-000000000001'), 'nor resumed by another group');

select set_eq($$ select public.take_room_leases(array['d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002']::uuid[], 'main/other:1') $$,
  $$ values ('d0000000-0000-4000-8000-000000000002'::uuid) $$, 'the batch refresh returns the leases it holds');

-- seats
insert into public.room_members (room_id, user_id, display_name, color) values
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'One', '#000000'),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'Two', '#000000');
select throws_ok($$ insert into public.room_members (room_id, user_id, display_name, color) values ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003', 'Three', '#000000') $$,
  'P0001', 'the room is full', 'a third member cannot join two seats');
update public.room_members set left_at = now() where user_id = 'b0000000-0000-4000-8000-000000000001' and room_id = 'd0000000-0000-4000-8000-000000000002';
select lives_ok($$ insert into public.room_members (room_id, user_id, display_name, color) values ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003', 'Three', '#000000') $$, 'a freed seat can be taken');
select throws_ok($$ update public.room_members set left_at = null where user_id = 'b0000000-0000-4000-8000-000000000001' and room_id = 'd0000000-0000-4000-8000-000000000002' $$,
  'P0001', 'the room is full', 'coming back to a full room is refused');
select lives_ok($$ update public.room_members set display_name = 'Two again' where user_id = 'b0000000-0000-4000-8000-000000000002' $$, 'active members can still be updated');

-- email code attempts
insert into public.email_otp_codes (user_id, purpose, code_hash, expires_at) values ('b0000000-0000-4000-8000-000000000001', 'login', repeat('a', 64), now() + interval '10 minutes');
create temp table granted (n int);
do $$ begin for i in 1..7 loop
  insert into granted select count(*) from public.otp_attempt((select max(id) from public.email_otp_codes), 5);
end loop; end $$;
select is((select sum(n)::int from granted), 5, 'only 5 attempts are ever granted');
set local role authenticated;
select throws_ok($$ select * from public.take_room_lease('d0000000-0000-4000-8000-000000000001', 'x') $$, '42501', null, 'clients cannot take leases');
reset role;

select * from finish();
rollback;
