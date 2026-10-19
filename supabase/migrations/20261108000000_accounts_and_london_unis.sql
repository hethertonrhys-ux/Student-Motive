-- =====================================================================
-- Accounts with a full name, nickname and graduation year, and sign-up
-- open to every London university.
--
-- Only ADDS things: three new columns on profiles, new rows in
-- universities, two extra columns on the profile_cards view, and one more
-- allowed sign-up event. Nothing existing is deleted or overwritten.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

-- 1. What an account needs: the person's real name, an optional nickname
--    (what others see when set), and the year they graduate.
alter table public.profiles
  add column if not exists full_name text check (char_length(full_name) <= 80),
  add column if not exists nickname text check (char_length(nickname) <= 40),
  add column if not exists graduation_year smallint check (graduation_year between 2020 and 2040);

-- 2. Every London university. Same list as packages/shared/src/universities.ts.
--    Existing rows (LSE, UCL, KCL, Imperial) are left exactly as they are.
insert into public.universities (id, name, short_name, domains) values
  ('LSE', 'London School of Economics', 'LSE', array['lse.ac.uk']),
  ('UCL', 'University College London', 'UCL', array['ucl.ac.uk']),
  ('KCL', 'King''s College London', 'King''s', array['kcl.ac.uk']),
  ('Imperial', 'Imperial College London', 'Imperial', array['imperial.ac.uk', 'ic.ac.uk']),
  ('QMUL', 'Queen Mary University of London', 'QMUL', array['qmul.ac.uk']),
  ('City', 'City St George''s, University of London', 'City St George''s', array['city.ac.uk', 'citystgeorges.ac.uk', 'sgul.ac.uk']),
  ('Goldsmiths', 'Goldsmiths, University of London', 'Goldsmiths', array['gold.ac.uk']),
  ('RHUL', 'Royal Holloway, University of London', 'Royal Holloway', array['rhul.ac.uk', 'live.rhul.ac.uk']),
  ('Birkbeck', 'Birkbeck, University of London', 'Birkbeck', array['bbk.ac.uk']),
  ('SOAS', 'SOAS University of London', 'SOAS', array['soas.ac.uk']),
  ('Brunel', 'Brunel University of London', 'Brunel', array['brunel.ac.uk']),
  ('Westminster', 'University of Westminster', 'Westminster', array['westminster.ac.uk', 'my.westminster.ac.uk']),
  ('Greenwich', 'University of Greenwich', 'Greenwich', array['gre.ac.uk', 'greenwich.ac.uk']),
  ('Kingston', 'Kingston University London', 'Kingston', array['kingston.ac.uk']),
  ('LondonMet', 'London Metropolitan University', 'London Met', array['londonmet.ac.uk']),
  ('Middlesex', 'Middlesex University', 'Middlesex', array['mdx.ac.uk', 'live.mdx.ac.uk']),
  ('Roehampton', 'University of Roehampton', 'Roehampton', array['roehampton.ac.uk']),
  ('UAL', 'University of the Arts London', 'UAL', array['arts.ac.uk']),
  ('UEL', 'University of East London', 'UEL', array['uel.ac.uk']),
  ('LSBU', 'London South Bank University', 'LSBU', array['lsbu.ac.uk']),
  ('StMarys', 'St Mary''s University, Twickenham', 'St Mary''s', array['stmarys.ac.uk', 'live.stmarys.ac.uk']),
  ('UWL', 'University of West London', 'UWL', array['uwl.ac.uk']),
  ('RVC', 'Royal Veterinary College', 'RVC', array['rvc.ac.uk']),
  ('LSHTM', 'London School of Hygiene & Tropical Medicine', 'LSHTM', array['lshtm.ac.uk']),
  ('ICR', 'Institute of Cancer Research', 'ICR', array['icr.ac.uk']),
  ('LBS', 'London Business School', 'LBS', array['london.edu']),
  ('Regents', 'Regent''s University London', 'Regent''s', array['regents.ac.uk']),
  ('Courtauld', 'The Courtauld Institute of Art', 'Courtauld', array['courtauld.ac.uk']),
  ('RCA', 'Royal College of Art', 'RCA', array['rca.ac.uk']),
  ('RAM', 'Royal Academy of Music', 'RAM', array['ram.ac.uk']),
  ('RCM', 'Royal College of Music', 'RCM', array['rcm.ac.uk']),
  ('Guildhall', 'Guildhall School of Music & Drama', 'Guildhall', array['gsmd.ac.uk']),
  ('TrinityLaban', 'Trinity Laban Conservatoire of Music and Dance', 'Trinity Laban', array['trinitylaban.ac.uk']),
  ('CSSD', 'Royal Central School of Speech and Drama', 'Central', array['cssd.ac.uk']),
  ('Ravensbourne', 'Ravensbourne University London', 'Ravensbourne', array['ravensbourne.ac.uk', 'rave.ac.uk']),
  ('UoL', 'University of London (Senate House and intercollegiate halls)', 'UoL', array['london.ac.uk']),
  ('Richmond', 'Richmond American University London', 'Richmond', array['richmond.ac.uk']),
  ('NUL', 'Northeastern University London', 'Northeastern', array['nulondon.ac.uk', 'nchlondon.ac.uk']),
  ('Hult', 'Hult International Business School (London)', 'Hult', array['hult.edu'])
on conflict (id) do nothing;

-- Imperial also uses ic.ac.uk; City St George's absorbed St George's (sgul).
-- Add any domains missing from rows that already existed, without removing any.
update public.universities set domains = array(select distinct d from unnest(domains || array['ic.ac.uk']) d) where id = 'Imperial';

-- 3. A listed domain now also covers its subdomains, so "live.rhul.ac.uk"
--    counts as Royal Holloway. Exact matches still win.
create or replace function public.uni_from_email(address text)
returns text
language sql stable security definer set search_path = ''
as $$
  select u.id from public.universities u
  where lower(split_part(address, '@', 2)) = any (u.domains)
  union all
  select u.id from public.universities u
  where exists (select 1 from unnest(u.domains) d where lower(split_part(address, '@', 2)) like '%.' || d)
  limit 1;
$$;

-- 4. The sign-up rule's wording (the rule itself is unchanged: a London
--    university email, or an email the Function team has allowed).
create or replace function public.check_signup_email()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.uni_from_email(new.email) is not null
     or exists (
       select 1 from public.allowed_emails a
       where a.email = lower(new.email)
          or (a.email like '@%' and lower(new.email) like '%' || a.email)
     ) then
    return new;
  end if;
  raise exception 'Function is for London university students. Use your uni email, or the email you were invited with.';
end;
$$;

-- 5. What other students can see of a profile: now also the full name and
--    nickname (shown together on a profile page), the uni and the year.
create or replace view public.profile_cards as
  select id,
    coalesce(nullif(display_name, ''), 'Member') as name,
    avatar_url,
    course,
    bio,
    nullif(full_name, '') as full_name,
    nullif(nickname, '') as nickname,
    university,
    graduation_year
  from public.profiles;

-- 6. The sign-up funnel can record that the account details step was finished.
alter table public.signup_events drop constraint if exists signup_events_event_check;
alter table public.signup_events add constraint signup_events_event_check
  check (event in ('signup_finished', 'prompts_step_reached', 'prompts_skipped', 'prompts_completed', 'account_details_completed'));
