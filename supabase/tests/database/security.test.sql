-- Moderation and 2FA: is_member() honours bans and requires a passed second factor.
-- Run: npm run test:db
begin;
select plan(13);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'host@example.com'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'learner@example.com');
insert into public.rooms (id, title, host_id, invite_code)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Test room', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'TEST01');
insert into public.room_members (room_id, user_id, role, display_name, color) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'host', 'Host', '#f2d16b'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'learner', 'Learner', '#8fc7e8');

-- seats stay capped at 5
select throws_ok($$ update public.rooms set seats = 6 where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' $$, '23514', null, 'a room has at most 5 seats');

-- a plain member can read the room
set local role authenticated;
set local request.jwt.claims = '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated", "aal": "aal1", "session_id": "dddddddd-dddd-4ddd-8ddd-dddddddddddd"}';
select ok(public.is_member('cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 'member without 2FA reads the room');
reset role;

-- email 2FA on: the same aal1 session is locked out until it passes
insert into public.user_security (user_id, email_2fa_enabled) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
set local role authenticated;
select ok(not public.mfa_satisfied(), 'email 2FA on, not passed: unsatisfied');
select ok(not public.is_member('cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 'and the room is hidden');
select is((select count(*)::int from public.rooms), 0, 'RLS returns no rooms');
reset role;

-- the session passes email 2FA
insert into public.mfa_sessions (session_id, user_id, method) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'email');
set local role authenticated;
select ok(public.is_member('cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 'after email 2FA the room is visible again');

-- another session of the same user is still locked
set local request.jwt.claims = '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated", "aal": "aal1", "session_id": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"}';
select ok(not public.mfa_satisfied(), 'a different session must pass 2FA itself');

-- an aal2 session (authenticator app) always satisfies
set local request.jwt.claims = '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated", "aal": "aal2", "session_id": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"}';
select ok(public.mfa_satisfied(), 'aal2 satisfies');
reset role;

-- a banned member loses access
update public.room_members set banned = true where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
set local role authenticated;
select ok(not public.is_member('cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 'banned members cannot read the room');
reset role;

-- mfa_facts(): the API's single query
select results_eq(
  $$ select totp_verified, email_2fa, session_passed_email from public.mfa_facts('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') $$,
  $$ values (false, true, true) $$,
  'mfa_facts sees email 2FA and the passed session'
);
select results_eq(
  $$ select session_passed_email from public.mfa_facts('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null) $$,
  $$ values (false) $$,
  'no session id: not passed'
);
select results_eq(
  $$ select totp_verified, email_2fa, session_passed_email from public.mfa_facts('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null) $$,
  $$ values (false, false, false) $$,
  'a user without factors'
);
set local role authenticated;
select throws_ok($$ select * from public.mfa_facts('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null) $$, '42501', null, 'clients cannot call mfa_facts');
reset role;

select * from finish();
rollback;
