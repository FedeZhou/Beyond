-- ============================================================================
-- BEYOND — applications, admin portal and onboarding (Supabase, free plan)
-- ----------------------------------------------------------------------------
-- Run this AFTER supabase/schema.sql, once, in the SQL Editor:
--   SQL Editor → New query → paste all of this file → Run.
-- It only adds or replaces "beyond_" things, and it is safe to run again.
--
-- SHARED PROJECT: as in schema.sql, nothing the other app uses is touched.
--
-- What it adds
--   beyond_applications   Every mentor / mentee application from the website.
--                         Written only by the "beyond-apply" Edge Function;
--                         only admins can read it.
--   beyond_invites        (existing) now also holds the join link of an
--                         accepted application: only a hash of its token,
--                         when it expires and when it was used.
--   beyond_profiles       (existing) now remembers which application it came
--                         from, and when the member first saved their card
--                         (onboarded_at). Cards appear in the directory only
--                         after that first save.
--   beyond_audit_log      Every admin action (accept, reject, suspend, …).
--   beyond_rate_limits    Counters the Edge Functions use against spam.
--
-- How a new member gets in
--   1. Someone applies → a row in beyond_applications (status "pending").
--   2. An admin clicks Accept in admin.html → an invite row with a join token.
--   3. They open the join link and choose a password → their account is
--      created → the trigger gives them a card pre-filled from the application.
--   4. They check the card (and add a photo) and save → onboarded_at is set →
--      they appear in the directory.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Applications
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.beyond_application_status as enum ('pending', 'accepted', 'rejected');
exception when duplicate_object then null;
end $$;

create table if not exists public.beyond_applications (
  id            uuid primary key default gen_random_uuid(),
  role          text not null check (role in ('mentor', 'mentee')),
  status        public.beyond_application_status not null default 'pending',

  email         text not null check (email = lower(email) and char_length(email) between 3 and 254),
  first_name    text not null check (char_length(first_name) between 1 and 60),
  last_name     text not null check (char_length(last_name) between 1 and 60),
  city          text not null check (char_length(city) between 1 and 80),
  country       text not null check (char_length(country) between 1 and 80),
  -- The questions that differ between mentors and mentees (see the forms).
  -- Kept together so a question can change without changing the database.
  answers       jsonb not null default '{}'::jsonb
                check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 16384),

  age_confirmed boolean not null check (age_confirmed),        -- 18 or older
  consent_at    timestamptz not null default now(),            -- ticked Terms + Privacy
  created_at    timestamptz not null default now(),

  reviewed_at   timestamptz,
  reviewed_by   uuid references auth.users (id) on delete set null,
  decision_note text check (decision_note is null or char_length(decision_note) <= 2000),

  -- Email bookkeeping (shown in the admin portal)
  confirmation_sent_at timestamptz,
  admin_notified_at    timestamptz,
  last_email_error     text,

  ip_hash       text                                           -- never the raw address
);

-- One pending application per email and role
create unique index if not exists beyond_applications_one_pending_idx
  on public.beyond_applications (email, role) where status = 'pending';
create index if not exists beyond_applications_status_idx
  on public.beyond_applications (status, created_at desc);


-- ---------------------------------------------------------------------------
-- 2. Invites and profiles: new columns
-- ---------------------------------------------------------------------------
alter table public.beyond_invites
  add column if not exists application_id uuid references public.beyond_applications (id) on delete set null,
  add column if not exists token_hash     text unique,       -- sha256 of the join token
  add column if not exists expires_at     timestamptz,
  add column if not exists sent_at        timestamptz,
  add column if not exists claimed_at     timestamptz,
  add column if not exists invited_by     uuid references auth.users (id) on delete set null;

alter table public.beyond_profiles
  add column if not exists application_id uuid references public.beyond_applications (id) on delete set null,
  add column if not exists onboarded_at   timestamptz;

-- Cards that were already filled in before this file count as onboarded
update public.beyond_profiles
   set onboarded_at = updated_at
 where onboarded_at is null and first_name <> '';


-- ---------------------------------------------------------------------------
-- 3. Admin log and rate limits
-- ---------------------------------------------------------------------------
create table if not exists public.beyond_audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid references auth.users (id) on delete set null,
  actor_email text,
  action      text not null,
  target      text,
  details     jsonb not null default '{}'::jsonb
);
create index if not exists beyond_audit_log_at_idx on public.beyond_audit_log (at desc);

create table if not exists public.beyond_rate_limits (
  bucket       text primary key,
  window_start timestamptz not null default now(),
  hits         int not null default 0
);

-- Counts one hit in a bucket; true while the bucket is within its limit
create or replace function public.beyond_hit(p_bucket text, p_max int, p_window interval)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_hits int;
begin
  insert into public.beyond_rate_limits as r (bucket, window_start, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update set
    window_start = case when r.window_start < now() - p_window then now() else r.window_start end,
    hits         = case when r.window_start < now() - p_window then 1 else r.hits + 1 end
  returning hits into v_hits;

  -- Now and then, forget old counters
  if random() < 0.02 then
    delete from public.beyond_rate_limits where window_start < now() - interval '2 days';
  end if;

  return v_hits <= p_max;
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. Helpers
-- ---------------------------------------------------------------------------

-- Is the signed-in person an approved Beyond admin?
create or replace function public.beyond_is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.beyond_profiles
    where id = (select auth.uid()) and role = 'admin' and status = 'approved'
  );
$$;

-- The account id for an email (used by the Edge Functions only)
create or replace function public.beyond_user_id_by_email(p_email text)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

-- Copies an application into a card that has not been saved by its member yet
create or replace function public.beyond_prefill_profile(p_profile uuid, p_application uuid)
returns void
language sql security definer
set search_path = ''
as $$
  update public.beyond_profiles p set
    application_id = a.id,
    first_name = left(a.first_name, 60),
    last_name  = left(a.last_name, 60),
    city       = left(a.city, 80),
    country    = left(a.country, 80),
    position   = left(btrim(coalesce(case when a.role = 'mentor' then a.answers->>'position'
                                          else a.answers->>'programme' end, '')), 120),
    company    = left(btrim(coalesce(case when a.role = 'mentor' then a.answers->>'company'
                                          else a.answers->>'school' end, '')), 120),
    studies    = array_remove(array[
                   nullif(left(btrim(case when a.role = 'mentor'
                     then coalesce(a.answers->>'highest_degree', '')
                     else concat_ws(', ', nullif(btrim(a.answers->>'school'), ''),
                                          nullif(btrim(a.answers->>'programme'), ''))
                   end), 200), '')
                 ], null)
  from public.beyond_applications a
  where a.id = p_application and p.id = p_profile and p.onboarded_at is null;
$$;


-- ---------------------------------------------------------------------------
-- 5. Triggers (replacing the ones from schema.sql): also pre-fill the card
-- ---------------------------------------------------------------------------

-- A new account is created (by the join link, or by the other app):
-- if its email is invited to Beyond, give it a Beyond card.
create or replace function public.beyond_handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_invite public.beyond_invites%rowtype;
begin
  select * into v_invite from public.beyond_invites where email = lower(new.email);
  if found then
    insert into public.beyond_profiles (id, role) values (new.id, v_invite.role)
    on conflict (id) do nothing;
    if v_invite.application_id is not null then
      perform public.beyond_prefill_profile(new.id, v_invite.application_id);
    end if;
  end if;
  return new;
end;
$$;

-- An email that already has an account (e.g. from the other app) is invited:
-- give that account a Beyond card straight away.
create or replace function public.beyond_handle_new_invite()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select u.id into v_user from auth.users u where lower(u.email) = new.email limit 1;
  if v_user is not null then
    insert into public.beyond_profiles (id, role) values (v_user, new.role)
    on conflict (id) do nothing;
    if new.application_id is not null then
      perform public.beyond_prefill_profile(v_user, new.application_id);
    end if;
  end if;
  return new;
end;
$$;

-- Rate limit for card edits made from the website (dashboard and admin edits
-- are not limited), and the date of a member's first save
create or replace function public.beyond_profiles_before_update()
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
    if old.onboarded_at is null then
      new.onboarded_at := now();
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 6. Admin portal: list of members (with their email, which cards don't show)
-- ---------------------------------------------------------------------------
create or replace function public.beyond_admin_list_members()
returns table (
  email          text,
  id             uuid,
  role           public.beyond_member_role,
  status         text,
  first_name     text,
  last_name      text,
  city           text,
  country        text,
  "position"     text,
  company        text,
  has_photo      boolean,
  is_listed      boolean,
  onboarded_at   timestamptz,
  application_id uuid,
  invited_at     timestamptz,
  invite_sent_at timestamptz,
  invite_expires_at timestamptz,
  claimed_at     timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.beyond_is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
    -- Everyone invited, whether or not they have joined yet
    select i.email, p.id, coalesce(p.role, i.role), p.status,
           p.first_name, p.last_name, p.city, p.country, p.position, p.company,
           p.photo_path is not null, p.is_listed, p.onboarded_at,
           coalesce(p.application_id, i.application_id),
           i.created_at, i.sent_at, i.expires_at, i.claimed_at
    from public.beyond_invites i
    left join auth.users u on lower(u.email) = i.email
    left join public.beyond_profiles p on p.id = u.id
    union all
    -- Cards whose invite was deleted by hand
    select lower(u.email), p.id, p.role, p.status,
           p.first_name, p.last_name, p.city, p.country, p.position, p.company,
           p.photo_path is not null, p.is_listed, p.onboarded_at,
           p.application_id, null, null, null, null
    from public.beyond_profiles p
    join auth.users u on u.id = p.id
    where not exists (select 1 from public.beyond_invites i where i.email = lower(u.email));
end;
$$;


-- ---------------------------------------------------------------------------
-- 7. Access rules
-- ---------------------------------------------------------------------------
alter table public.beyond_applications enable row level security;
alter table public.beyond_audit_log    enable row level security;
alter table public.beyond_rate_limits  enable row level security;

-- Visitors who are not signed in: nothing at all
revoke all on public.beyond_applications from anon, authenticated;
revoke all on public.beyond_audit_log    from anon, authenticated;
revoke all on public.beyond_rate_limits  from anon, authenticated;
revoke all on public.beyond_invites      from anon, authenticated;
grant  all on public.beyond_applications, public.beyond_audit_log,
              public.beyond_rate_limits,  public.beyond_invites to service_role;

-- Admins can READ applications, invites and the log. Every change goes
-- through the "beyond-admin" Edge Function, which also sends the emails.
grant select on public.beyond_applications to authenticated;
grant select on public.beyond_invites      to authenticated;
grant select on public.beyond_audit_log    to authenticated;

drop policy if exists "Beyond: admins read applications" on public.beyond_applications;
create policy "Beyond: admins read applications"
  on public.beyond_applications for select to authenticated
  using ((select public.beyond_is_admin()));

drop policy if exists "Beyond: admins read invites" on public.beyond_invites;
create policy "Beyond: admins read invites"
  on public.beyond_invites for select to authenticated
  using ((select public.beyond_is_admin()));

drop policy if exists "Beyond: admins read the log" on public.beyond_audit_log;
create policy "Beyond: admins read the log"
  on public.beyond_audit_log for select to authenticated
  using ((select public.beyond_is_admin()));

-- Directory: a card shows up only after its member has saved it once
drop policy if exists "Beyond: members read approved, listed cards" on public.beyond_profiles;
create policy "Beyond: members read approved, listed cards"
  on public.beyond_profiles for select to authenticated
  using ((select public.beyond_is_member()) and status = 'approved' and is_listed
         and onboarded_at is not null);

drop policy if exists "Beyond: admins read every card" on public.beyond_profiles;
create policy "Beyond: admins read every card"
  on public.beyond_profiles for select to authenticated
  using ((select public.beyond_is_admin()));

-- Functions: only what the website needs can be called from outside
revoke execute on function public.beyond_hit(text, int, interval)          from public, anon, authenticated;
revoke execute on function public.beyond_user_id_by_email(text)            from public, anon, authenticated;
revoke execute on function public.beyond_prefill_profile(uuid, uuid)       from public, anon, authenticated;
revoke execute on function public.beyond_handle_new_user()                 from public, anon, authenticated;
revoke execute on function public.beyond_handle_new_invite()               from public, anon, authenticated;
revoke execute on function public.beyond_profiles_before_update()          from public, anon, authenticated;
revoke execute on function public.beyond_is_admin()                        from public, anon;
revoke execute on function public.beyond_admin_list_members()              from public, anon;
grant  execute on function public.beyond_hit(text, int, interval)          to service_role;
grant  execute on function public.beyond_user_id_by_email(text)            to service_role;
grant  execute on function public.beyond_prefill_profile(uuid, uuid)       to service_role;
grant  execute on function public.beyond_is_admin()                        to authenticated, service_role;
grant  execute on function public.beyond_admin_list_members()              to authenticated;
