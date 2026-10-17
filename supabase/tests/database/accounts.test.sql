-- Accounts and profiles: signup trigger, username rules, RLS, avatars bucket.
-- Run: npm run test:db
begin;
select plan(13);

-- signup with metadata
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-4111-8111-111111111111', 'ana@example.com', '{"username": "Ana_K", "display_name": "Ana", "color": "#8fc7e8"}');
select is((select username::text from public.profiles where id = '11111111-1111-4111-8111-111111111111'), 'ana_k', 'username comes from metadata, lowercased');
select is((select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111'), 'Ana', 'display name from metadata');
select is((select color from public.profiles where id = '11111111-1111-4111-8111-111111111111'), '#8fc7e8', 'color from metadata');

-- no metadata: username from the email local part, cleaned
insert into auth.users (id, email) values ('22222222-2222-4222-8222-222222222222', 'gio.b-test@example.com');
select is((select username::text from public.profiles where id = '22222222-2222-4222-8222-222222222222'), 'gio_b_test', 'username from email, [a-z0-9_] only');
select is((select display_name from public.profiles where id = '22222222-2222-4222-8222-222222222222'), 'gio_b_test', 'display name falls back to the username');

-- collision: same requested username gets a suffix
insert into auth.users (id, email, raw_user_meta_data)
values ('33333333-3333-4333-8333-333333333333', 'other@example.com', '{"username": "ana_k"}');
select is((select username::text from public.profiles where id = '33333333-3333-4333-8333-333333333333'), 'ana_k1', 'a taken username gets a numeric suffix');

-- too short: generated
insert into auth.users (id, email) values ('44444444-4444-4444-8444-444444444444', 'x@example.com');
select matches((select username::text from public.profiles where id = '44444444-4444-4444-8444-444444444444'), '^user_[0-9a-f]{8}$', 'short names fall back to user_<id>');

-- username rules
select throws_ok($$ update public.profiles set username = 'Bad Name!' where id = '11111111-1111-4111-8111-111111111111' $$, '23514', null, 'username format is enforced');
select throws_ok($$ update public.profiles set username = 'ANA_K1' where id = '11111111-1111-4111-8111-111111111111' $$, '23505', null, 'usernames are unique case-insensitively');
select throws_ok($$ update public.profiles set bio = repeat('x', 281) where id = '11111111-1111-4111-8111-111111111111' $$, '23514', null, 'bio is at most 280 characters');

-- RLS: any signed-in user reads profiles; nobody writes them from the client
set local role authenticated;
set local request.jwt.claims = '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}';
select ok((select count(*) from public.profiles where id in ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333')) = 2, 'signed-in users read other users'' profiles');
update public.profiles set bio = 'hacked' where id = '11111111-1111-4111-8111-111111111111';
reset role;
select is((select bio from public.profiles where id = '11111111-1111-4111-8111-111111111111'), '', 'clients cannot update profiles');

-- avatars bucket
select results_eq(
  $$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars' $$,
  $$ values (true, 2097152::bigint, array['image/png', 'image/jpeg', 'image/webp']) $$,
  'avatars bucket: public, 2 MiB, images only'
);

select * from finish();
rollback;
