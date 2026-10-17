-- User settings and account deletion.
-- Run: npm run test:db
begin;
select plan(7);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'ana@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'gio@example.com');
insert into public.user_settings (user_id) values ('11111111-1111-4111-8111-111111111111');

select results_eq(
  $$ select tutor_voice, voice_rate, captions, reduced_motion, theme, language, email_notifications from public.user_settings where user_id = '11111111-1111-4111-8111-111111111111' $$,
  $$ values (true, 1.00::numeric(3,2), true, false, 'system', 'en', true) $$,
  'defaults match DEFAULT_SETTINGS'
);
select throws_ok($$ update public.user_settings set voice_rate = 2.5 where user_id = '11111111-1111-4111-8111-111111111111' $$, '23514', null, 'voice rate is between 0.5 and 2');
select throws_ok($$ update public.user_settings set theme = 'neon' where user_id = '11111111-1111-4111-8111-111111111111' $$, '23514', null, 'theme is system, light or dark');
select throws_ok($$ update public.user_settings set language = 'fr' where user_id = '11111111-1111-4111-8111-111111111111' $$, '23514', null, 'language is en or ka');

-- RLS: own settings only
set local role authenticated;
set local request.jwt.claims = '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}';
select is((select count(*)::int from public.user_settings), 0, 'nobody reads another user''s settings');
reset role;

-- deleting a host deletes their settings and profile; their ended rooms stay, without a host
insert into public.rooms (id, title, host_id, invite_code, phase)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Old class', '11111111-1111-4111-8111-111111111111', 'OLD001', 'ended');
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
select is((select host_id from public.rooms where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), null, 'an ended hosted room stays for its learners, with no host');
select is((select count(*)::int from public.profiles where id = '11111111-1111-4111-8111-111111111111') + (select count(*)::int from public.user_settings where user_id = '11111111-1111-4111-8111-111111111111'), 0, 'profile and settings are deleted');

select * from finish();
rollback;
