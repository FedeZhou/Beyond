-- ============================================================================
-- BEYOND — members directory (Supabase, free plan)
-- ----------------------------------------------------------------------------
-- Run this ONCE in your Supabase project: SQL Editor → New query → paste → Run.
-- It is safe to keep in the public repository: it contains no keys or data.
--
-- SHARED PROJECT: this Supabase project is also used by another app, so
-- everything here is prefixed with "beyond_" (photos: "beyond-avatars") and
-- nothing that app uses is changed. People from the other app get NO access to
-- Beyond: only emails you add to beyond_invites become Beyond members.
--
-- What it creates
--   beyond_invites    Emails you have approved, and whether they are a mentor or
--                     a mentee. Only you (the dashboard) can see or change it.
--   beyond_profiles   One card per member. Members can read every approved card
--                     and edit only their own; never their role or status.
--   beyond-avatars    Private photo storage. Members can see photos; each member
--                     can upload only into their own folder (small JPEGs, max 3).
--   beyond_ping()     Tiny function the GitHub "keep awake" job calls.
--
-- Limits built in (the website checks the same limits, see js/content.js → members)
--   Studies and Experience: max 3 lines each, 200 characters per line.
--   Card edits: at most one every 3 seconds and 30 per hour, per member.
--   Photos: JPEG only, max 256 KB each (the site shrinks them to ~40 KB first).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Types and tables
-- ---------------------------------------------------------------------------
create type public.beyond_member_role as enum ('mentor', 'mentee', 'admin');

create table public.beyond_invites (
  email      text primary key check (email = lower(email)),
  role       public.beyond_member_role not null default 'mentee',
  created_at timestamptz not null default now()
);

-- True when every line in the list is 1–max_length characters long
create function public.beyond_lines_ok(lines text[], max_length int)
returns boolean
language sql immutable
set search_path = ''
as $$
  select coalesce(bool_and(char_length(line) between 1 and max_length), true)
  from unnest(lines) as line;
$$;

create table public.beyond_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.beyond_member_role not null default 'mentee',
  status      text not null default 'approved' check (status in ('approved', 'suspended')),

  first_name  text not null default '' check (char_length(first_name) <= 60),
  last_name   text not null default '' check (char_length(last_name) <= 60),
  city        text not null default '' check (char_length(city) <= 80),
  country     text not null default '' check (char_length(country) <= 80),
  position    text not null default '' check (char_length(position) <= 120),
  company     text not null default '' check (char_length(company) <= 120),
  studies     text[] not null default '{}'
              check (cardinality(studies) <= 3 and public.beyond_lines_ok(studies, 200)),
  experience  text[] not null default '{}'
              check (cardinality(experience) <= 3 and public.beyond_lines_ok(experience, 200)),
  photo_path  text check (photo_path is null or photo_path like (id::text || '/%')),
  is_listed   boolean not null default true,      -- members can hide their own card

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Rate limit bookkeeping (managed by the trigger below, not editable by members)
  edit_window_start timestamptz not null default now(),
  edits_in_window   smallint not null default 0
);

-- Directory query: approved, listed cards in name order
create index beyond_profiles_directory_idx
  on public.beyond_profiles (last_name, first_name)
  where status = 'approved' and is_listed;


-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

-- Is the signed-in person an approved Beyond member?
create function public.beyond_is_member()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.beyond_profiles
    where id = (select auth.uid()) and status = 'approved'
  );
$$;

-- How many photos the signed-in person has stored (caps storage per member)
create function public.beyond_my_avatar_count()
returns int
language sql stable security definer
set search_path = ''
as $$
  select count(*)::int from storage.objects
  where bucket_id = 'beyond-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text;
$$;

-- Keep-awake ping
create function public.beyond_ping()
returns int
language sql stable
set search_path = ''
as $$ select 1; $$;


-- ---------------------------------------------------------------------------
-- 3. Triggers: an invited email gets a Beyond card, nobody else does
-- ---------------------------------------------------------------------------

-- A new account is created (by you in the dashboard, or by the other app):
-- if its email is invited to Beyond, give it a starter Beyond card.
create function public.beyond_handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.beyond_profiles (id, role)
  select new.id, i.role from public.beyond_invites i where i.email = lower(new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger beyond_on_auth_user_created
  after insert on auth.users
  for each row execute function public.beyond_handle_new_user();

-- You invite an email that already has an account (e.g. from the other app):
-- give that account a Beyond card straight away.
create function public.beyond_handle_new_invite()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.beyond_profiles (id, role)
  select u.id, new.role from auth.users u where lower(u.email) = new.email
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger beyond_on_invite_created
  after insert on public.beyond_invites
  for each row execute function public.beyond_handle_new_invite();

-- Rate limit for card edits made from the website (dashboard edits are not limited)
create function public.beyond_profiles_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if old.updated_at > now() - interval '3 seconds' then
      raise exception 'rate_limited: please wait a few seconds before saving again'
        using errcode = 'P0001';
    end if;
    if old.edit_window_start < now() - interval '1 hour' then
      new.edit_window_start := now();
      new.edits_in_window := 1;
    elsif old.edits_in_window >= 30 then
      raise exception 'rate_limited: too many changes, please try again later'
        using errcode = 'P0001';
    else
      new.edits_in_window := old.edits_in_window + 1;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger beyond_profiles_before_update
  before update on public.beyond_profiles
  for each row execute function public.beyond_profiles_before_update();


-- ---------------------------------------------------------------------------
-- 4. Access rules (Row Level Security)
-- ---------------------------------------------------------------------------
alter table public.beyond_invites  enable row level security;
alter table public.beyond_profiles enable row level security;

-- beyond_invites: no rules at all, so only the dashboard can use it
revoke all on public.beyond_invites from anon, authenticated;

-- beyond_profiles: nothing for visitors who are not signed in
revoke all on public.beyond_profiles from anon;
revoke all on public.beyond_profiles from authenticated;
grant select on public.beyond_profiles to authenticated;
grant update (first_name, last_name, city, country, position, company,
              studies, experience, photo_path, is_listed)
  on public.beyond_profiles to authenticated;

create policy "Beyond: members read their own card"
  on public.beyond_profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Beyond: members read approved, listed cards"
  on public.beyond_profiles for select to authenticated
  using ((select public.beyond_is_member()) and status = 'approved' and is_listed and first_name <> '');

create policy "Beyond: members edit their own card"
  on public.beyond_profiles for update to authenticated
  using (id = (select auth.uid()) and status = 'approved')
  with check (id = (select auth.uid()));

-- Functions: only what the website needs can be called from outside
revoke execute on function public.beyond_handle_new_user()        from public, anon, authenticated;
revoke execute on function public.beyond_handle_new_invite()      from public, anon, authenticated;
revoke execute on function public.beyond_profiles_before_update() from public, anon, authenticated;
revoke execute on function public.beyond_my_avatar_count()        from public, anon;
revoke execute on function public.beyond_is_member()              from public, anon;
grant  execute on function public.beyond_my_avatar_count()        to authenticated;
grant  execute on function public.beyond_is_member()              to authenticated;
grant  execute on function public.beyond_ping()                   to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5. Photo storage (its own bucket; the other app's buckets are not touched)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('beyond-avatars', 'beyond-avatars', false, 262144, array['image/jpeg']);

create policy "Beyond: members view photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'beyond-avatars' and (select public.beyond_is_member()));

create policy "Beyond: members upload their own photo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'beyond-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.beyond_is_member())
    and (select public.beyond_my_avatar_count()) < 3
  );

create policy "Beyond: members delete their own photo"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'beyond-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
