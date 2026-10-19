-- Country flag on profiles: an optional two-letter country code on each
-- profile, shown as a flag next to the person's name. Only adds a column and
-- widens the profile_cards view; existing rules stay (you can only set your
-- own; the view already hides email).

alter table public.profiles add column if not exists country text
  check (country is null or country ~ '^[A-Z]{2}$');

-- The same view as before with `country` added at the end (a replaced view
-- must keep its existing columns in the same order).
create or replace view public.profile_cards as
  select id,
    coalesce(nullif(display_name, ''), 'Member') as name,
    avatar_url,
    course,
    bio,
    nullif(full_name, '') as full_name,
    nullif(nickname, '') as nickname,
    university,
    graduation_year,
    country
  from public.profiles;
