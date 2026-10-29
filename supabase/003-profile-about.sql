-- ============================================================================
-- BEYOND — "About me" and LinkedIn on member cards (Supabase, free plan)
-- ----------------------------------------------------------------------------
-- Run this AFTER schema.sql and 002-applications.sql, once, in the SQL Editor:
--   SQL Editor → New query → paste all of this file → Run.
-- It only adds or replaces "beyond_" things, and it is safe to run again.
--
-- What it adds to beyond_profiles
--   description   A few words about the member (hobbies, interests…), up to 300 characters.
--   linkedin      The address of their LinkedIn profile (must start with http:// or https://).
-- Members can edit both from my-card.html, like the rest of their card.
-- Mentors' LinkedIn address is copied from their application, like the other fields.
-- ============================================================================

alter table public.beyond_profiles
  add column if not exists description text not null default ''
    check (char_length(description) <= 300),
  add column if not exists linkedin text not null default ''
    check (char_length(linkedin) <= 300 and (linkedin = '' or linkedin ~* '^https?://'));

grant update (description, linkedin) on public.beyond_profiles to authenticated;

-- Copies an application into a card that has not been saved by its member yet
-- (the version from 002-applications.sql, plus the mentor's LinkedIn address)
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
                 ], null),
    linkedin   = case when a.role = 'mentor' and a.answers->>'linkedin' ~* '^https?://'
                      then left(btrim(a.answers->>'linkedin'), 300) else '' end
  from public.beyond_applications a
  where a.id = p_application and p.id = p_profile and p.onboarded_at is null;
$$;
