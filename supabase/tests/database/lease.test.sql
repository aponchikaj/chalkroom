-- Room conductor lease: an instance resumes its own rooms and abandoned ones, never live rooms
-- another instance is heartbeating.
-- Run: npm run test:db
begin;
select plan(4);

insert into auth.users (id, email) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'host@example.com');
insert into public.rooms (id, title, host_id, invite_code, phase) values
  ('c0000000-0000-4000-8000-000000000001', 'mine', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'LEASE1', 'teaching'),
  ('c0000000-0000-4000-8000-000000000002', 'theirs, alive', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'LEASE2', 'check'),
  ('c0000000-0000-4000-8000-000000000003', 'theirs, dead', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'LEASE3', 'qa'),
  ('c0000000-0000-4000-8000-000000000004', 'nobody', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'LEASE4', 'check'),
  ('c0000000-0000-4000-8000-000000000005', 'ended', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'LEASE5', 'ended');
insert into public.room_leases (room_id, conductor_id, seen_at) values
  ('c0000000-0000-4000-8000-000000000001', 'api-a', now()),
  ('c0000000-0000-4000-8000-000000000002', 'api-b', now()),
  ('c0000000-0000-4000-8000-000000000003', 'api-b', now() - interval '1 minute');

select set_eq(
  $$ select r from public.resumable_rooms('api-a') r where r::text like 'c0000000%' $$,
  $$ values ('c0000000-0000-4000-8000-000000000001'::uuid), ('c0000000-0000-4000-8000-000000000003'::uuid), ('c0000000-0000-4000-8000-000000000004'::uuid) $$,
  'api-a resumes its own, the abandoned and the unowned live rooms'
);
select ok(not exists (select 1 from public.resumable_rooms('api-a') r where r = 'c0000000-0000-4000-8000-000000000002'), 'never a room another instance is heartbeating');
select ok(not exists (select 1 from public.resumable_rooms('api-a') r where r = 'c0000000-0000-4000-8000-000000000005'), 'never an ended room');
set local role authenticated;
select throws_ok($$ select * from public.resumable_rooms('x') $$, '42501', null, 'clients cannot call it');
reset role;

select * from finish();
rollback;
