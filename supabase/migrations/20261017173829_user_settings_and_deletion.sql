-- User settings (B10) and account deletion.
--   user_settings: one row per user once they change anything; the API returns defaults
--   (DEFAULT_SETTINGS in packages/schema) until then. Text only for people: the voice settings
--   are about how the AI tutor's lines play, there is no microphone.
--   Account deletion: rooms hosted by a deleted user go with them (the API refuses deletion
--   while the user hosts a room that has not ended).

create table public.user_settings (
  user_id uuid primary key references auth.users on delete cascade,
  tutor_voice boolean not null default true,
  voice_rate numeric(3, 2) not null default 1 check (voice_rate between 0.5 and 2),
  captions boolean not null default true,
  reduced_motion boolean not null default false,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  language text not null default 'en' check (language in ('en', 'ka')),
  email_notifications boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger user_settings_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

alter table public.user_settings enable row level security;
create policy "own settings" on public.user_settings for select to authenticated using (user_id = auth.uid());

-- deleting a user deletes the rooms they hosted (and, through cascades, those rooms' data)
alter table public.rooms drop constraint rooms_host_id_fkey;
alter table public.rooms
  add constraint rooms_host_id_fkey foreign key (host_id) references auth.users on delete cascade;
create index rooms_host on public.rooms (host_id);
