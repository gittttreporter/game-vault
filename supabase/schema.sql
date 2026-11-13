-- ============================================================================
-- GAME VAULT — Supabase schema
-- Run this whole file in: Supabase Dashboard → SQL Editor → New query
-- It is idempotent enough for a fresh project; run it ONCE on a new project.
-- ============================================================================

-- ── extensions ──────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;

-- ── PROFILES (one row per auth user; marks the admin) ───────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- auto-create a profile whenever a user is created (admin script / dashboard)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- helper used by every RLS policy (security definer → no recursion)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- ── GAMES ───────────────────────────────────────────────────────────────────
create table if not exists public.games (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  slug           text unique not null,
  description    text not null default '',
  cover_url      text,
  screenshots    jsonb not null default '[]'::jsonb,   -- ["https://...", ...]
  platforms      text[] not null default '{}'::text[], -- windows|linux|macos|android
  external_links jsonb not null default '{}'::jsonb,   -- {itch,steam,trailer}
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists games_touch_updated_at on public.games;
create trigger games_touch_updated_at
  before update on public.games
  for each row execute function public.touch_updated_at();

-- ── TAGS ────────────────────────────────────────────────────────────────────
create table if not exists public.tags (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  slug       text unique not null,
  color      text,                 -- optional hex, e.g. '#00e5ff'
  created_at timestamptz not null default now()
);

create table if not exists public.game_tags (
  game_id uuid not null references public.games (id) on delete cascade,
  tag_id  uuid not null references public.tags (id) on delete cascade,
  primary key (game_id, tag_id)
);

-- ── VERSIONS ────────────────────────────────────────────────────────────────
create table if not exists public.game_versions (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references public.games (id) on delete cascade,
  version_string text not null,
  changelog      text not null default '',   -- markdown
  release_date   date not null default current_date,
  is_latest      boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (game_id, version_string)
);

-- keep exactly one is_latest = true per game (most recent release_date)
create or replace function public.sync_latest_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  g uuid;
begin
  if pg_trigger_depth() > 1 then
    -- our own UPDATE below re-fires this trigger; don't recurse
    return null;
  end if;

  g := coalesce(new.game_id, old.game_id);

  update public.game_versions v
     set is_latest = (v.release_date, v.created_at) = (
           select (x.release_date, x.created_at)
             from public.game_versions x
            where x.game_id = g
            order by x.release_date desc, x.created_at desc
            limit 1
         )
   where v.game_id = g;

  return coalesce(new, old);
end;
$$;

drop trigger if exists versions_sync_latest on public.game_versions;
create trigger versions_sync_latest
  after insert or update or delete on public.game_versions
  for each row execute function public.sync_latest_version();

-- ── DOWNLOADS (one row per version × platform × provider) ──────────────────
create table if not exists public.downloads (
  id              uuid primary key default gen_random_uuid(),
  version_id      uuid not null references public.game_versions (id) on delete cascade,
  platform        text not null check (platform in ('windows','linux','macos','android','source')),
  provider        text not null check (provider in ('github','mediafire')),
  url             text not null,
  file_size_bytes bigint not null default 0,
  sha256          text,
  is_multi_part   boolean not null default false,
  parts           jsonb not null default '[]'::jsonb,
  -- [{name:'part1',url:'https://...',size_bytes:123}, ...]
  created_at      timestamptz not null default now()
);

-- auto-set is_multi_part from the parts array
create or replace function public.sync_multi_part()
returns trigger language plpgsql as $$
begin
  new.is_multi_part := coalesce(jsonb_array_length(new.parts), 0) > 0;
  return new;
end;
$$;

drop trigger if exists downloads_sync_multi_part on public.downloads;
create trigger downloads_sync_multi_part
  before insert or update on public.downloads
  for each row execute function public.sync_multi_part();

-- ── DOWNLOAD LOG ────────────────────────────────────────────────────────────
create table if not exists public.user_downloads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  download_id   uuid not null references public.downloads (id) on delete cascade,
  downloaded_at timestamptz not null default now()
);

-- extra FK so Supabase can join user_downloads → profiles for the admin log view
alter table public.user_downloads
  drop constraint if exists user_downloads_user_profile_fkey;
alter table public.user_downloads
  add constraint user_downloads_user_profile_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

-- ── RATINGS ─────────────────────────────────────────────────────────────────
create table if not exists public.ratings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  game_id    uuid not null references public.games (id) on delete cascade,
  score      int not null check (score between 1 and 5),
  created_at timestamptz not null default now(),
  unique (user_id, game_id)
);

-- ── indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_game_versions_game   on public.game_versions (game_id, release_date desc);
create index if not exists idx_downloads_version    on public.downloads (version_id);
create index if not exists idx_game_tags_tag        on public.game_tags (tag_id);
create index if not exists idx_user_downloads_user  on public.user_downloads (user_id, downloaded_at desc);
create index if not exists idx_ratings_game         on public.ratings (game_id);

-- ============================================================================
-- ROW LEVEL SECURITY — the heart of the "private" part of the site.
-- Anonymous visitors can see NOTHING. Logged-in friends can read games and
-- rate + log their own downloads. Only you (is_admin) can write content.
-- ============================================================================

alter table public.profiles       enable row level security;
alter table public.games          enable row level security;
alter table public.tags           enable row level security;
alter table public.game_tags      enable row level security;
alter table public.game_versions  enable row level security;
alter table public.downloads      enable row level security;
alter table public.user_downloads enable row level security;
alter table public.ratings        enable row level security;

-- ── profiles ──
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ── content tables: authenticated read, admin write ──
drop policy if exists games_select on public.games;
create policy games_select on public.games
  for select to authenticated using (true);
drop policy if exists games_write on public.games;
create policy games_write on public.games
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists tags_select on public.tags;
create policy tags_select on public.tags
  for select to authenticated using (true);
drop policy if exists tags_write on public.tags;
create policy tags_write on public.tags
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists game_tags_select on public.game_tags;
create policy game_tags_select on public.game_tags
  for select to authenticated using (true);
drop policy if exists game_tags_write on public.game_tags;
create policy game_tags_write on public.game_tags
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists versions_select on public.game_versions;
create policy versions_select on public.game_versions
  for select to authenticated using (true);
drop policy if exists versions_write on public.game_versions;
create policy versions_write on public.game_versions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists downloads_select on public.downloads;
create policy downloads_select on public.downloads
  for select to authenticated using (true);
drop policy if exists downloads_write on public.downloads;
create policy downloads_write on public.downloads
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── ratings: everyone logged in can read, users manage their own ──
drop policy if exists ratings_select on public.ratings;
create policy ratings_select on public.ratings
  for select to authenticated using (true);
drop policy if exists ratings_write on public.ratings;
create policy ratings_write on public.ratings
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── download log: users insert/read their own; admin reads everything ──
drop policy if exists user_downloads_select on public.user_downloads;
create policy user_downloads_select on public.user_downloads
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists user_downloads_insert on public.user_downloads;
create policy user_downloads_insert on public.user_downloads
  for insert to authenticated
  with check (user_id = auth.uid());

-- ============================================================================
-- STORAGE — 'covers' bucket for game cover art.
-- Covers are stored in a PUBLIC bucket so they can be shown as <img> without
-- per-request signed URLs. Only the file NAMES are public — game data stays
-- behind RLS. If you want covers private too, see README §"Hardening".
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do update set public = true;

drop policy if exists covers_read on storage.objects;
create policy covers_read on storage.objects
  for select to public
  using (bucket_id = 'covers');

drop policy if exists covers_write on storage.objects;
create policy covers_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'covers' and public.is_admin());

drop policy if exists covers_update on storage.objects;
create policy covers_update on storage.objects
  for update to authenticated
  using (bucket_id = 'covers' and public.is_admin());

drop policy if exists covers_delete on storage.objects;
create policy covers_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'covers' and public.is_admin());

-- ============================================================================
-- DONE. Final manual step (can't be done in SQL):
--   Supabase Dashboard → Authentication → Sign In / Providers → Email:
--     • DISABLE "Allow new users to sign up"
--     • DISABLE "Confirm email" (friends get instant access)
--
-- Then create your 5 accounts with scripts/create-user.mjs (see README),
-- and make yourself admin:
--   update public.profiles set is_admin = true
--    where id = (select id from auth.users where email = 'you@example.com');
-- ============================================================================
