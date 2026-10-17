-- Accounts and profiles (B9, B10).
-- Every user who signs up (email + password) gets a profile row from a trigger on auth.users.
-- Profiles hold only public information (username, display name, color, avatar, bio), so any
-- signed-in user may read them. Private settings live in user_security (security_2fa migration).
-- Avatars live in the public `avatars` bucket; only the API (service role) writes there.

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Generic updated_at trigger (reused by later migrations)
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: username, avatar, bio
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column username extensions.citext,
  add column avatar_path text,
  add column bio text not null default '',
  add column updated_at timestamptz not null default now();

-- rows created before this migration (anonymous dev users) get a generated username
update public.profiles set username = 'user_' || substr(replace(id::text, '-', ''), 1, 12) where username is null;

alter table public.profiles
  alter column username set not null,
  add constraint profiles_username_key unique (username),
  -- letters keep the case people typed; uniqueness ignores case (citext)
  add constraint profiles_username_format check (username::text ~ '^[A-Za-z0-9_]{3,24}$'),
  add constraint profiles_display_name_length check (char_length(display_name) between 1 and 32),
  add constraint profiles_color_format check (color ~ '^#[0-9a-fA-F]{6}$'),
  add constraint profiles_bio_length check (char_length(bio) <= 280),
  -- an object key inside the avatars bucket, e.g. "<user id>/<uuid>.webp"
  add constraint profiles_avatar_path_format check (avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$');

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- New auth user -> profile row
-- ---------------------------------------------------------------------------

-- Username from signup metadata (`options.data.username`), else from the email's local part,
-- normalized to [a-z0-9_]; a numeric suffix resolves collisions.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_base text;
  v_name text;
  v_try text;
  v_n int := 0;
begin
  v_base := lower(regexp_replace(coalesce(nullif(v_meta ->> 'username', ''), split_part(coalesce(new.email, ''), '@', 1), ''), '[^a-zA-Z0-9_]', '_', 'g'));
  v_base := substr(v_base, 1, 20);
  if char_length(v_base) < 3 then
    v_base := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  v_try := v_base;
  while exists (select 1 from public.profiles p where p.username = v_try::extensions.citext) loop
    v_n := v_n + 1;
    v_try := substr(v_base, 1, 20) || v_n::text;
  end loop;

  v_name := substr(coalesce(nullif(trim(v_meta ->> 'display_name'), ''), v_try), 1, 32);

  insert into public.profiles (id, username, display_name, color)
  values (
    new.id,
    v_try,
    v_name,
    case when coalesce(v_meta ->> 'color', '') ~ '^#[0-9a-fA-F]{6}$' then v_meta ->> 'color' else '#f2d16b' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS: profiles are public to signed-in users; writes stay with the API
-- ---------------------------------------------------------------------------

drop policy if exists "own profile" on public.profiles;
create policy "signed-in users read profiles" on public.profiles for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Avatars bucket: public read, 2 MiB, images only. No client write policies: the API issues a
-- signed upload URL, then commits the path to profiles.avatar_path after checking the object.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
