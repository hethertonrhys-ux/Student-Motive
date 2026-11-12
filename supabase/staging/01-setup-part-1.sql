-- =====================================================================
-- Function TEST database setup, part 1 of 4. Paste into the SQL Editor
-- of the TEST project (function-staging) only, never the real one. Run
-- the parts in order.
--
-- The TEST project's web address contains pvldkzjrrhcnwctveemu.
-- If the address in your browser contains xrpbmcoptyrpgkdowfdt, that is
-- the REAL project: stop, and don't run anything.
--
-- How: open this file in Notepad, press Ctrl+A then Ctrl+C, go to the
-- SQL Editor, click "New query", click in the empty box, press Ctrl+V,
-- then click "Run". It takes a few seconds. When it has worked you will
-- see "Success. No rows returned". Then do part 2.
--
-- If a red error appears instead, nothing has been changed (each part
-- runs all or nothing). Take a screenshot, send it, and don't change
-- anything in this file.
--
-- This part contains these files from the app's code, unchanged, in order
-- (files 1 to 18 of 50):
--    1. 20261015000000_initial_schema.sql
--    2. 20261017000000_members_formats_ledger.sql
--    3. 20261017120000_tables_flexibility_and_self_reporting.sql
--    4. 20261018000000_table_bank.sql
--    5. 20261018120000_confirm_seat_and_start_tables.sql
--    6. 20261019000000_allow_other_emails.sql
--    7. 20261020000000_social.sql
--    8. 20261021000000_profile_photos.sql
--    9. 20261022000000_social_section.sql
--   10. 20261023000000_profile_upgrade.sql
--   11. 20261024000000_food_category.sql
--   12. 20261024000001_learn_category.sql
--   13. 20261025000000_social_event_cost.sql
--   14. 20261026000000_society_event_cost.sql
--   15. 20261027000000_social_event_chats.sql
--   16. 20261028000000_photos_stay.sql
--   17. 20261029000000_photo_order.sql
--   18. 20261030000000_profile_prompts.sql
--
-- At its very end it adds one line of its own: it lets addresses at
-- @staging.studentfunction.com sign up (for the test accounts), and marks this
-- database as the test project, which the later files check for.
--
-- Made by check/build.py from code version 4b06cc0. Don't edit by hand.
-- =====================================================================

-- Safety check first. It changes nothing; it stops the whole paste (so
-- nothing at all is changed) if this isn't the test project, or if the
-- parts are being run out of order or twice.
do $$
declare
  looks_real boolean := false;
begin
  -- 1. A real database has real accounts.
  if (select count(*) from auth.users) > 50 then
    raise exception 'STOP: this looks like your real Function database (it has real accounts). These files are only for the test project function-staging.';
  end if;
  -- 2. The real project's timers and push secret point at its own address.
  begin
    if to_regclass('cron.job') is not null then
      execute 'select exists (select 1 from cron.job where command like ''%xrpbmcoptyrpgkdowfdt%'')' into looks_real;
    end if;
    if not looks_real and to_regclass('vault.decrypted_secrets') is not null then
      execute 'select exists (select 1 from vault.decrypted_secrets where decrypted_secret like ''%xrpbmcoptyrpgkdowfdt%'')' into looks_real;
    end if;
  exception when others then
    null; -- can't look: check 1 still applies
  end;
  if looks_real then
    raise exception 'STOP: this looks like your real Function database (its timers or secrets point at the real project xrpbmcoptyrpgkdowfdt). These files are only for the test project function-staging.';
  end if;
  -- 3. Part 1 makes the profiles table, so if it's already here either part 1
  --    has run (then the marker part 1 adds at its end is here too) or this
  --    is a database that was set up some other way, like the real one.
  if to_regclass('public.profiles') is not null then
    if to_regclass('public.allowed_emails') is null then
      raise exception 'STOP: this is not the test project (it already has the Function tables, but part 1 of these files was never run here). Nothing was changed. These files are only for the test project function-staging (pvldkzjrrhcnwctveemu).';
    end if;
    if not exists (select 1 from public.allowed_emails where email = '@staging.studentfunction.com') then
      raise exception 'STOP: this is not the test project (it already has the Function tables, but part 1 of these files was never run here). Nothing was changed. These files are only for the test project function-staging (pvldkzjrrhcnwctveemu).';
    end if;
    raise exception 'STOP: part 1 has already been run here, so nothing was changed. Only if your browser address contains pvldkzjrrhcnwctveemu, go on to part 2; otherwise stop, you are in the wrong project.';
  end if;
end $$;

-- ===== 20261015000000_initial_schema.sql =====
-- =====================================================================
-- Motive: initial database schema
--
-- Run this ONCE in Supabase: Dashboard -> SQL Editor -> New query ->
-- paste this whole file -> Run. Then run supabase/seed.sql the same way.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Types (fixed lists of allowed values)
-- ---------------------------------------------------------------------

-- What kind of organisation a "society" row is. Halls, other
-- universities and club-night promoters all appear in the Societies tab.
create type public.org_kind as enum ('society', 'hall', 'university', 'promoter');

-- Map filter categories. "Free food" is a separate yes/no flag on the
-- event, because a careers talk can also have free pizza.
create type public.event_category as enum ('social', 'nightlife', 'careers', 'sport', 'arts', 'talks');

create type public.venue_kind as enum ('campus', 'hall', 'university', 'club', 'other');
create type public.claim_status as enum ('pending', 'approved', 'rejected');
create type public.report_status as enum ('open', 'resolved', 'dismissed');


-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------

-- One row per person who has logged in. Created automatically on sign-up.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text,
  avatar_url   text,
  is_admin     boolean not null default false,  -- Motive team only
  created_at   timestamptz not null default now()
);

-- Non-LSE emails we let in anyway (e.g. Apple's app reviewer test login).
create table public.allowed_emails (
  email      text primary key check (email = lower(email)),
  note       text,
  created_at timestamptz not null default now()
);

-- Societies, halls, other universities and promoters.
create table public.societies (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),  -- used in web links
  name        text not null,
  kind        public.org_kind not null default 'society',
  university  text not null default 'LSE',
  description text,
  logo_url    text,
  instagram   text,
  website     text,
  is_verified boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Which users can post for which society (committee members).
create table public.society_admins (
  society_id uuid not null references public.societies (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (society_id, user_id)
);

-- A committee member asking to manage a society page. We approve these.
create table public.society_claims (
  id                uuid primary key default gen_random_uuid(),
  society_id        uuid not null references public.societies (id) on delete cascade,
  user_id           uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  committee_role    text,   -- e.g. "President"
  message           text,
  status            public.claim_status not null default 'pending',
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now()
);
create unique index society_claims_one_pending
  on public.society_claims (society_id, user_id) where status = 'pending';

-- Known places with map coordinates: LSE buildings, halls, other campuses, clubs.
create table public.venues (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  short_name text,
  kind       public.venue_kind not null default 'campus',
  address    text,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  created_at timestamptz not null default now()
);

create table public.events (
  id            uuid primary key default gen_random_uuid(),
  society_id    uuid not null references public.societies (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 120),
  description   text check (char_length(description) <= 5000),
  category      public.event_category not null,
  free_food     boolean not null default false,
  -- Where it is: either a known venue, or a custom pin (lat/lng).
  venue_id      uuid references public.venues (id) on delete set null,
  lat           double precision check (lat between -90 and 90),
  lng           double precision check (lng between -180 and 180),
  location_note text,   -- e.g. "Room 2.04" or "Back room upstairs"
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  image_url     text,
  ticket_url    text,
  is_cancelled  boolean not null default false,
  is_hidden     boolean not null default false,  -- set by Motive admins after a report
  going_count   integer not null default 0,      -- kept up to date automatically
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at),
  check (venue_id is not null or (lat is not null and lng is not null))
);
create index events_starts_at_idx on public.events (starts_at);
create index events_society_id_idx on public.events (society_id);

-- Students following societies.
create table public.follows (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  society_id uuid not null references public.societies (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, society_id)
);
create index follows_society_id_idx on public.follows (society_id);

-- "I'm going" taps.
create table public.going (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  event_id   uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index going_event_id_idx on public.going (event_id);

-- Students hiding a society's content (required by the App Store).
create table public.blocks (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  society_id uuid not null references public.societies (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, society_id)
);

-- Reports of bad content (required by the App Store).
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid default auth.uid() references public.profiles (id) on delete set null,
  event_id    uuid references public.events (id) on delete cascade,
  society_id  uuid references public.societies (id) on delete cascade,
  reason      text not null check (char_length(reason) between 1 and 200),
  details     text check (char_length(details) <= 2000),
  status      public.report_status not null default 'open',
  created_at  timestamptz not null default now(),
  check (event_id is not null or society_id is not null)
);


-- ---------------------------------------------------------------------
-- 3. Helper functions used by the security rules
-- ---------------------------------------------------------------------

-- Is the logged-in user on the Motive team?
create function public.is_motive_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select is_admin from public.profiles where id = (select auth.uid())),
    false
  );
$$;

-- Can the logged-in user manage this society? (Motive admins can manage all.)
create function public.is_society_admin(sid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.society_admins
    where society_id = sid and user_id = (select auth.uid())
  ) or public.is_motive_admin();
$$;


-- ---------------------------------------------------------------------
-- 4. Automatic behaviour (triggers)
-- ---------------------------------------------------------------------

-- 4a. Only @lse.ac.uk emails (plus allowed_emails) can sign up.
create function public.check_signup_email()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if lower(new.email) like '%@lse.ac.uk'
     or exists (select 1 from public.allowed_emails where email = lower(new.email)) then
    return new;
  end if;
  raise exception 'Motive is only open to @lse.ac.uk email addresses';
end;
$$;

create trigger check_signup_email
  before insert on auth.users
  for each row execute function public.check_signup_email();

-- 4b. Create a profile for every new user.
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, lower(new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4c. Keep events.updated_at current.
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- 4d. Keep events.going_count in step with the going table.
create function public.update_going_count()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.events set going_count = going_count + 1 where id = new.event_id;
  elsif tg_op = 'DELETE' then
    update public.events set going_count = greatest(going_count - 1, 0) where id = old.event_id;
  end if;
  return null;
end;
$$;

create trigger going_update_count
  after insert or delete on public.going
  for each row execute function public.update_going_count();

-- 4e. Stop app users changing fields only Motive should control.
-- Only applies to logged-in app users: changes made in the Supabase
-- dashboard or by our server (no logged-in user) are allowed.
-- (pg_trigger_depth() > 1 means the change came from another trigger,
-- like the going_count one above, which is allowed.)
create function public.protect_profile_fields()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1
     and (select auth.uid()) is not null
     and not public.is_motive_admin() then
    new.is_admin := old.is_admin;
    new.email := old.email;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

create function public.protect_society_fields()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1
     and (select auth.uid()) is not null
     and not public.is_motive_admin() then
    new.slug := old.slug;
    new.name := old.name;
    new.kind := old.kind;
    new.university := old.university;
    new.is_verified := old.is_verified;
  end if;
  return new;
end;
$$;

create trigger societies_protect_fields
  before update on public.societies
  for each row execute function public.protect_society_fields();

create function public.protect_event_fields()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1
     and (select auth.uid()) is not null
     and not public.is_motive_admin() then
    if tg_op = 'INSERT' then
      new.is_hidden := false;
      new.going_count := 0;
      new.created_by := (select auth.uid());
    else
      new.is_hidden := old.is_hidden;
      new.going_count := old.going_count;
      new.created_by := old.created_by;
      new.society_id := old.society_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger events_protect_fields
  before insert or update on public.events
  for each row execute function public.protect_event_fields();


-- ---------------------------------------------------------------------
-- 5. Security rules (Row Level Security)
--
-- "anon" = not logged in (e.g. someone opening a shared event link).
-- "authenticated" = logged in.
-- Motive admins get full access to everything via the *_admin_all rules.
-- ---------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.allowed_emails enable row level security;
alter table public.societies      enable row level security;
alter table public.society_admins enable row level security;
alter table public.society_claims enable row level security;
alter table public.venues         enable row level security;
alter table public.events         enable row level security;
alter table public.follows        enable row level security;
alter table public.going          enable row level security;
alter table public.blocks         enable row level security;
alter table public.reports        enable row level security;

-- Motive admins: full access everywhere.
create policy profiles_admin_all       on public.profiles       for all to authenticated using (public.is_motive_admin()) with check (public.is_motive_admin());
create policy allowed_emails_admin_all on public.allowed_emails for all to authenticated using (public.is_motive_admin()) with check (public.is_motive_admin());
create policy societies_admin_all      on public.societies      for all to authenticated using (public.is_motive_admin()) with check (public.is_motive_admin());
create policy society_admins_admin_all on public.society_admins for all to authenticated using (public.is_motive_admin()) with check (public.is_motive_admin());
create policy society_claims_admin_all on public.society_claims for all to authenticated using (public.is_motive_admin()) with check (public.is_motive_admin());
create policy venues_admin_all         on public.venues         for all to authenticated using (public.is_motive_admin()) with check (public.is_motive_admin());
create policy events_admin_all         on public.events         for all to authenticated using (public.is_motive_admin()) with check (public.is_motive_admin());
create policy reports_admin_all        on public.reports        for all to authenticated using (public.is_motive_admin()) with check (public.is_motive_admin());

-- Profiles: you can see and edit only your own.
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Societies and venues: public information, anyone can read.
create policy societies_select_all on public.societies for select to anon, authenticated using (true);
create policy venues_select_all    on public.venues    for select to anon, authenticated using (true);

-- Societies: committee members can edit their own page's details.
create policy societies_update_by_admins on public.societies for update to authenticated
  using (public.is_society_admin(id)) with check (public.is_society_admin(id));

-- Society admins: you can see which societies you manage.
create policy society_admins_select_own on public.society_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- Claims: you can submit and see your own.
create policy society_claims_insert_own on public.society_claims for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy society_claims_select_own on public.society_claims for select to authenticated
  using (user_id = (select auth.uid()));

-- Events: anyone can read visible events (so shared links work without login).
-- Committee members also see their own hidden events.
create policy events_select_visible on public.events for select to anon, authenticated
  using (not is_hidden or public.is_society_admin(society_id));
-- Only a society's committee can create, edit or delete its events.
create policy events_insert_by_admins on public.events for insert to authenticated
  with check (public.is_society_admin(society_id));
create policy events_update_by_admins on public.events for update to authenticated
  using (public.is_society_admin(society_id)) with check (public.is_society_admin(society_id));
create policy events_delete_by_admins on public.events for delete to authenticated
  using (public.is_society_admin(society_id));

-- Follows, going, blocks: students manage only their own.
create policy follows_select_own on public.follows for select to authenticated using (user_id = (select auth.uid()));
create policy follows_insert_own on public.follows for insert to authenticated with check (user_id = (select auth.uid()));
create policy follows_delete_own on public.follows for delete to authenticated using (user_id = (select auth.uid()));

create policy going_select_own on public.going for select to authenticated using (user_id = (select auth.uid()));
create policy going_insert_own on public.going for insert to authenticated with check (user_id = (select auth.uid()));
create policy going_delete_own on public.going for delete to authenticated using (user_id = (select auth.uid()));

create policy blocks_select_own on public.blocks for select to authenticated using (user_id = (select auth.uid()));
create policy blocks_insert_own on public.blocks for insert to authenticated with check (user_id = (select auth.uid()));
create policy blocks_delete_own on public.blocks for delete to authenticated using (user_id = (select auth.uid()));

-- Reports: you can file reports and see your own.
create policy reports_insert_own on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open');
create policy reports_select_own on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));


-- ---------------------------------------------------------------------
-- 6. Image storage (society logos and event images)
--
-- Files go in the "images" bucket under a folder named after the
-- society's id, e.g. images/<society-id>/poster.jpg. Anyone can view;
-- only that society's committee can upload, replace or delete.
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create function public.can_manage_image(object_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_motive_admin() or exists (
    select 1 from public.society_admins
    where society_id::text = (storage.foldername(object_name))[1]
      and user_id = (select auth.uid())
  );
$$;

create policy images_select_all on storage.objects for select to anon, authenticated
  using (bucket_id = 'images');
create policy images_insert_by_admins on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and public.can_manage_image(name));
create policy images_update_by_admins on storage.objects for update to authenticated
  using (bucket_id = 'images' and public.can_manage_image(name))
  with check (bucket_id = 'images' and public.can_manage_image(name));
create policy images_delete_by_admins on storage.objects for delete to authenticated
  using (bucket_id = 'images' and public.can_manage_image(name));


-- ---------------------------------------------------------------------
-- 7. Live updates: the map refreshes when events change.
-- ---------------------------------------------------------------------

alter publication supabase_realtime add table public.events;

-- ===== 20261017000000_members_formats_ledger.sql =====
-- =====================================================================
-- Motive: society members, event formats (sign-up lists and tables),
-- and the results ledger.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Society members (approved by the society's committee)
-- ---------------------------------------------------------------------

create type public.membership_status as enum ('pending', 'approved');

create table public.society_members (
  society_id  uuid not null references public.societies (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  status      public.membership_status not null default 'pending',
  created_at  timestamptz not null default now(),
  approved_at timestamptz,
  primary key (society_id, user_id)
);
create index society_members_user_idx on public.society_members (user_id);

-- Emails the committee has pre-approved (e.g. pasted from the SU membership
-- list). When someone with one of these emails asks to join, they're
-- approved straight away.
create table public.society_member_invites (
  society_id uuid not null references public.societies (id) on delete cascade,
  email      text not null check (email = lower(email)),
  created_at timestamptz not null default now(),
  primary key (society_id, email)
);

-- Is the logged-in user an approved member (or an admin) of this society?
create function public.is_society_member(sid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.society_members
    where society_id = sid and user_id = (select auth.uid()) and status = 'approved'
  ) or public.is_society_admin(sid);
$$;

-- A student asks to join. Also saves the name they want shown to others.
create function public.request_membership(sid uuid, your_name text)
returns public.membership_status
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  user_email text;
  result public.membership_status;
begin
  if uid is null then raise exception 'Log in first'; end if;
  if not exists (select 1 from public.societies where id = sid) then raise exception 'Society not found'; end if;

  if nullif(trim(your_name), '') is not null then
    update public.profiles set display_name = left(trim(your_name), 60) where id = uid;
  end if;

  select email into user_email from public.profiles where id = uid;

  insert into public.society_members (society_id, user_id, status, approved_at)
  select sid, uid,
         case when inv.email is not null then 'approved'::public.membership_status else 'pending' end,
         case when inv.email is not null then now() end
  from (select 1) one
  left join public.society_member_invites inv on inv.society_id = sid and inv.email = user_email
  on conflict (society_id, user_id) do nothing;

  select status into result from public.society_members where society_id = sid and user_id = uid;
  return result;
end;
$$;

-- The committee pastes in member emails. Existing users are approved now;
-- everyone else is approved automatically when they sign up and ask to join.
create function public.invite_members(sid uuid, emails text[])
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  e text;
  added integer := 0;
  uid uuid;
begin
  if not public.is_society_admin(sid) then raise exception 'Not allowed'; end if;
  foreach e in array emails loop
    e := lower(trim(e));
    continue when e !~ '^[^@\s]+@[^@\s]+$';
    insert into public.society_member_invites (society_id, email) values (sid, e) on conflict do nothing;
    select id into uid from public.profiles where email = e;
    if uid is not null then
      insert into public.society_members (society_id, user_id, status, approved_at)
      values (sid, uid, 'approved', now())
      on conflict (society_id, user_id) do update set status = 'approved', approved_at = coalesce(public.society_members.approved_at, now());
    end if;
    added := added + 1;
  end loop;
  return added;
end;
$$;

-- Members list for the committee, including emails (only admins can call it).
create function public.society_member_list(sid uuid)
returns table (user_id uuid, name text, email text, status text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.user_id, coalesce(nullif(p.display_name, ''), split_part(p.email, '@', 1)), p.email, m.status::text, m.created_at
  from public.society_members m
  join public.profiles p on p.id = m.user_id
  where m.society_id = sid and public.is_society_admin(sid)
  union all
  select null, null, i.email, 'invited', i.created_at
  from public.society_member_invites i
  where i.society_id = sid and public.is_society_admin(sid)
    and not exists (select 1 from public.profiles p2 join public.society_members m2 on m2.user_id = p2.id
                    where p2.email = i.email and m2.society_id = sid)
$$;

alter table public.society_members enable row level security;
alter table public.society_member_invites enable row level security;

-- Students see their own memberships and can leave. Joining goes through request_membership().
create policy society_members_select on public.society_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_society_admin(society_id));
create policy society_members_leave on public.society_members for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_society_admin(society_id));
create policy society_members_admin_update on public.society_members for update to authenticated
  using (public.is_society_admin(society_id)) with check (public.is_society_admin(society_id));

create policy society_member_invites_admin on public.society_member_invites for all to authenticated
  using (public.is_society_admin(society_id)) with check (public.is_society_admin(society_id));

-- Names and photos people can see of each other (never emails).
create view public.profile_cards with (security_invoker = false) as
  select id, coalesce(nullif(display_name, ''), 'Member') as name, avatar_url
  from public.profiles;
revoke all on public.profile_cards from anon;
grant select on public.profile_cards to authenticated;


-- ---------------------------------------------------------------------
-- 2. Event formats
--   standard: people tap "I'm going"
--   entries:  a sign-up list, with an optional limit and a waiting list (e.g. tournaments)
--   tables:   people pick a table, each with a level and a number of seats (e.g. cash games)
-- ---------------------------------------------------------------------

alter table public.events
  add column format text not null default 'standard' check (format in ('standard', 'entries', 'tables')),
  add column capacity integer check (capacity is null or capacity between 1 and 2000),
  add column members_only boolean not null default false,
  add column results_published boolean not null default false;

create table public.event_tables (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  level      text check (char_length(level) <= 40),     -- e.g. "10p/20p"
  seats      integer not null default 8 check (seats between 2 and 20),
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index event_tables_event_idx on public.event_tables (event_id);

create type public.entry_status as enum ('going', 'waitlist');

-- Who's coming to an event. Replaces the old "going" table.
create table public.event_entries (
  event_id        uuid not null references public.events (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  status          public.entry_status not null default 'going',
  table_id        uuid references public.event_tables (id) on delete set null,
  finish_position integer check (finish_position > 0),   -- tournaments
  created_at      timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_entries_user_idx on public.event_entries (user_id);
create index event_entries_table_idx on public.event_entries (table_id);

insert into public.event_entries (event_id, user_id, status, created_at)
select event_id, user_id, 'going', created_at from public.going;
drop table public.going;
drop function public.update_going_count();

-- Keep events.going_count in step.
create function public.refresh_going_count()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  eid uuid := coalesce(new.event_id, old.event_id);
begin
  update public.events
  set going_count = (select count(*) from public.event_entries where event_id = eid and status = 'going')
  where id = eid;
  return null;
end;
$$;

create trigger event_entries_going_count
  after insert or update or delete on public.event_entries
  for each row execute function public.refresh_going_count();

create function public.event_society(eid uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select society_id from public.events where id = eid $$;

-- Join an event (optionally straight onto a table).
-- Locks the event row so two people can't take the last seat at once.
create function public.join_event(eid uuid, tid uuid default null)
returns public.entry_status
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  ev public.events;
  result public.entry_status;
begin
  if uid is null then raise exception 'Log in first'; end if;
  select * into ev from public.events where id = eid for update;
  if not found or ev.is_hidden or ev.is_cancelled then raise exception 'This event isn''t available'; end if;
  if ev.ends_at < now() then raise exception 'This event has finished'; end if;
  if ev.members_only and not public.is_society_member(ev.society_id) then
    raise exception 'Only members of this society can join';
  end if;

  select status into result from public.event_entries where event_id = eid and user_id = uid;
  if found then
    if tid is not null then perform public.choose_table(eid, tid); end if;
    return result;
  end if;

  result := 'going';
  if ev.format = 'entries' and ev.capacity is not null
     and (select count(*) from public.event_entries where event_id = eid and status = 'going') >= ev.capacity then
    result := 'waitlist';
  end if;

  if tid is not null then
    if ev.format <> 'tables' then raise exception 'This event doesn''t have tables'; end if;
    perform public.assert_seat_free(eid, tid);
  end if;

  insert into public.event_entries (event_id, user_id, status, table_id) values (eid, uid, result, tid);
  return result;
end;
$$;

create function public.assert_seat_free(eid uuid, tid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  t public.event_tables;
begin
  select * into t from public.event_tables where id = tid and event_id = eid;
  if not found then raise exception 'That table isn''t part of this event'; end if;
  if (select count(*) from public.event_entries where table_id = tid and status = 'going' and user_id <> auth.uid()) >= t.seats then
    raise exception 'That table is full';
  end if;
end;
$$;
revoke execute on function public.assert_seat_free(uuid, uuid) from public, anon, authenticated;

-- Pick, change or leave a table (tid = null stands up from your table).
create function public.choose_table(eid uuid, tid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform 1 from public.events where id = eid for update;
  if not exists (select 1 from public.event_entries where event_id = eid and user_id = uid and status = 'going') then
    raise exception 'Join the event first';
  end if;
  if tid is not null then perform public.assert_seat_free(eid, tid); end if;
  update public.event_entries set table_id = tid where event_id = eid and user_id = uid;
end;
$$;

-- Leave an event. If there's a waiting list, the next person moves up.
create function public.leave_event(eid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  was public.entry_status;
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform 1 from public.events where id = eid for update;
  delete from public.event_entries where event_id = eid and user_id = uid returning status into was;
  if was = 'going' then perform public.promote_waitlist(eid); end if;
end;
$$;

create function public.promote_waitlist(eid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.events;
begin
  select * into ev from public.events where id = eid;
  if ev.format <> 'entries' then return; end if;
  if ev.capacity is not null
     and (select count(*) from public.event_entries where event_id = eid and status = 'going') >= ev.capacity then
    return;
  end if;
  update public.event_entries set status = 'going'
  where (event_id, user_id) = (
    select event_id, user_id from public.event_entries
    where event_id = eid and status = 'waitlist' order by created_at limit 1
  );
end;
$$;
revoke execute on function public.promote_waitlist(uuid) from public, anon, authenticated;

alter table public.event_tables enable row level security;
alter table public.event_entries enable row level security;

-- Tables are as public as the event.
create policy event_tables_select on public.event_tables for select to anon, authenticated
  using (exists (select 1 from public.events e where e.id = event_id));
create policy event_tables_admin on public.event_tables for all to authenticated
  using (public.is_society_admin(public.event_society(event_id)))
  with check (public.is_society_admin(public.event_society(event_id)));

-- Entries: you see your own; the society's members and committee see who's coming.
-- Joining and leaving go through join_event / choose_table / leave_event.
create policy event_entries_select on public.event_entries for select to authenticated
  using (user_id = (select auth.uid()) or public.is_society_member(public.event_society(event_id)));
create policy event_entries_admin_update on public.event_entries for update to authenticated
  using (public.is_society_admin(public.event_society(event_id)))
  with check (public.is_society_admin(public.event_society(event_id)));
create policy event_entries_admin_delete on public.event_entries for delete to authenticated
  using (public.is_society_admin(public.event_society(event_id)));


-- ---------------------------------------------------------------------
-- 3. Results ledger (who's up or down, and payments already made)
-- Amounts are in pence. The website works out "who pays who".
-- ---------------------------------------------------------------------

create table public.ledger_rows (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  table_id    uuid references public.event_tables (id) on delete cascade,
  user_id     uuid references public.profiles (id) on delete set null,   -- null for players without Motive
  player_name text not null check (char_length(player_name) between 1 and 60),
  net_pence   integer not null default 0 check (abs(net_pence) <= 10000000),
  created_at  timestamptz not null default now()
);
create index ledger_rows_event_idx on public.ledger_rows (event_id);

-- e.g. someone leaving early pays another player before the end.
create table public.ledger_payments (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  from_row     uuid not null references public.ledger_rows (id) on delete cascade,
  to_row       uuid not null references public.ledger_rows (id) on delete cascade,
  amount_pence integer not null check (amount_pence between 1 and 10000000),
  created_at   timestamptz not null default now(),
  check (from_row <> to_row)
);
create index ledger_payments_event_idx on public.ledger_payments (event_id);

-- Both players in a payment must be in the same event and at the same table.
create function public.check_ledger_payment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(distinct (event_id, coalesce(table_id::text, '')))
      from public.ledger_rows where id in (new.from_row, new.to_row)) <> 1
     or (select event_id from public.ledger_rows where id = new.from_row) <> new.event_id then
    raise exception 'Both players must be at the same table in this event';
  end if;
  return new;
end;
$$;

create trigger ledger_payments_check
  before insert or update on public.ledger_payments
  for each row execute function public.check_ledger_payment();

alter table public.ledger_rows enable row level security;
alter table public.ledger_payments enable row level security;

-- The committee manages the ledger. Once they publish results, people who
-- came to the event can see it.
create function public.can_see_results(eid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_society_admin(public.event_society(eid)) or exists (
    select 1 from public.events e
    join public.event_entries en on en.event_id = e.id and en.user_id = (select auth.uid())
    where e.id = eid and e.results_published
  );
$$;

create policy ledger_rows_select on public.ledger_rows for select to authenticated using (public.can_see_results(event_id));
create policy ledger_rows_admin on public.ledger_rows for all to authenticated
  using (public.is_society_admin(public.event_society(event_id)))
  with check (public.is_society_admin(public.event_society(event_id)));
create policy ledger_payments_select on public.ledger_payments for select to authenticated using (public.can_see_results(event_id));
create policy ledger_payments_admin on public.ledger_payments for all to authenticated
  using (public.is_society_admin(public.event_society(event_id)))
  with check (public.is_society_admin(public.event_society(event_id)));

-- Live updates for seats filling up.
alter publication supabase_realtime add table public.event_entries;

-- ===== 20261017120000_tables_flexibility_and_self_reporting.sql =====
-- =====================================================================
-- Motive: "also happy to play at" tables, splitting a counting
-- difference, players reporting their own result when leaving early,
-- and the committee adding late arrivals.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================


-- 1. Other tables a player would happily move to.
alter table public.event_entries
  add column also_tables uuid[] not null default '{}';

create function public.set_also_tables(eid uuid, tids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mine uuid;
begin
  if uid is null then raise exception 'Log in first'; end if;
  select table_id into mine from public.event_entries where event_id = eid and user_id = uid;
  if not found then raise exception 'Join the event first'; end if;
  update public.event_entries
  set also_tables = coalesce((
    select array_agg(t.id order by t.position)
    from public.event_tables t
    where t.event_id = eid and t.id = any (tids) and t.id is distinct from mine
  ), '{}')
  where event_id = eid and user_id = uid;
end;
$$;


-- 2. An even share of any counting difference, kept separate from what
--    the player actually reported. Also record who entered each line.
alter table public.ledger_rows
  add column adjust_pence integer not null default 0 check (abs(adjust_pence) <= 1000000),
  add column created_by uuid default auth.uid() references public.profiles (id) on delete set null;

alter table public.ledger_payments
  add column created_by uuid default auth.uid() references public.profiles (id) on delete set null;


-- 3. Players reporting their own result and payments (e.g. leaving early).
--    Only for their own row, only at their own table, only until the
--    committee shares the final results.

create function public.my_ledger_row(eid uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  entry public.event_entries;
  ev public.events;
  row_id uuid;
begin
  if uid is null then raise exception 'Log in first'; end if;
  select * into ev from public.events where id = eid;
  if not found then raise exception 'Event not found'; end if;
  if ev.results_published then raise exception 'The results are final. Ask the committee to change them.'; end if;
  select * into entry from public.event_entries where event_id = eid and user_id = uid and status = 'going';
  if not found then raise exception 'Join the event first'; end if;
  if ev.format = 'tables' and entry.table_id is null then raise exception 'Pick your table first'; end if;

  select id into row_id from public.ledger_rows where event_id = eid and user_id = uid;
  if row_id is null then
    insert into public.ledger_rows (event_id, table_id, user_id, player_name, net_pence, created_by)
    select eid, entry.table_id, uid, coalesce(nullif(p.display_name, ''), 'Member'), 0, uid
    from public.profiles p where p.id = uid
    returning id into row_id;
  end if;
  return row_id;
end;
$$;
revoke execute on function public.my_ledger_row(uuid) from public, anon, authenticated;

create function public.record_my_result(eid uuid, net_pence integer)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  row_id uuid := public.my_ledger_row(eid);
begin
  if abs(net_pence) > 10000000 then raise exception 'That amount is too large'; end if;
  update public.ledger_rows set net_pence = record_my_result.net_pence, created_by = auth.uid() where id = row_id;
end;
$$;

-- other_user: the player at your table you paid (i_paid = true) or who paid you.
create function public.record_my_payment(eid uuid, other_user uuid, amount_pence integer, i_paid boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mine uuid := public.my_ledger_row(eid);
  my_table uuid;
  other_row uuid;
begin
  if amount_pence is null or amount_pence < 1 or amount_pence > 10000000 then raise exception 'Enter an amount'; end if;
  if other_user = uid then raise exception 'Choose another player'; end if;
  select table_id into my_table from public.ledger_rows where id = mine;

  if not exists (
    select 1 from public.event_entries
    where event_id = eid and user_id = other_user and status = 'going' and table_id is not distinct from my_table
  ) then
    raise exception 'They need to be at your table';
  end if;

  select id into other_row from public.ledger_rows where event_id = eid and user_id = other_user;
  if other_row is null then
    insert into public.ledger_rows (event_id, table_id, user_id, player_name, net_pence, created_by)
    select eid, my_table, other_user, coalesce(nullif(p.display_name, ''), 'Member'), 0, uid
    from public.profiles p where p.id = other_user
    returning id into other_row;
  end if;

  insert into public.ledger_payments (event_id, from_row, to_row, amount_pence, created_by)
  values (
    eid,
    case when i_paid then mine else other_row end,
    case when i_paid then other_row else mine end,
    amount_pence,
    uid
  );
end;
$$;

create function public.delete_my_payment(pid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.ledger_payments p
  using public.events e
  where p.id = pid and p.created_by = auth.uid() and e.id = p.event_id and not e.results_published;
end;
$$;

-- Players can see their own table's ledger lines while the event is on,
-- so they can check what they've entered.
drop policy ledger_rows_select on public.ledger_rows;
create policy ledger_rows_select on public.ledger_rows for select to authenticated
  using (public.can_see_results(event_id) or user_id = (select auth.uid()) or created_by = (select auth.uid()));
drop policy ledger_payments_select on public.ledger_payments;
create policy ledger_payments_select on public.ledger_payments for select to authenticated
  using (
    public.can_see_results(event_id) or created_by = (select auth.uid())
    or exists (select 1 from public.ledger_rows r where r.id in (from_row, to_row) and r.user_id = (select auth.uid()))
  );


-- 4. The committee can add someone to an event (e.g. arriving late).
create policy event_entries_admin_insert on public.event_entries for insert to authenticated
  with check (public.is_society_admin(public.event_society(event_id)));

-- ===== 20261018000000_table_bank.sql =====
-- =====================================================================
-- Motive: a "bank" player per table.
-- The bank takes everyone's buy-ins during the game and pays each player
-- their cash-out when they leave. The bank can keep the table's ledger
-- on their own phone.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

alter table public.event_tables
  add column bank_user_id uuid references public.profiles (id) on delete set null;

alter table public.ledger_rows
  add column buyin_pence integer not null default 0 check (buyin_pence between 0 and 10000000),
  add column cashout_pence integer check (cashout_pence between 0 and 10000000),   -- null = still playing
  add column paid_out boolean not null default false;

-- Is the logged-in user the bank for this table?
create function public.is_table_bank(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.event_tables where id = tid and bank_user_id = (select auth.uid()));
$$;

-- The bank can read and keep their own table's ledger.
create policy ledger_rows_bank on public.ledger_rows for all to authenticated
  using (table_id is not null and public.is_table_bank(table_id))
  with check (table_id is not null and public.is_table_bank(table_id));

-- ===== 20261018120000_confirm_seat_and_start_tables.sql =====
-- =====================================================================
-- Motive: confirming your seat, and the committee starting a table early.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

-- The table a player last confirmed. If it differs from their current
-- table (they moved, or the committee moved them), they're asked to
-- confirm the change.
alter table public.event_entries
  add column confirmed_table_id uuid references public.event_tables (id) on delete set null;

create function public.confirm_seat(eid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  update public.event_entries
  set confirmed_table_id = table_id
  where event_id = eid and user_id = auth.uid() and table_id is not null;
  if not found then raise exception 'Pick a table first'; end if;
end;
$$;

-- When the committee starts a table before the event's official start.
alter table public.event_tables
  add column started_at timestamptz;

-- ===== 20261019000000_allow_other_emails.sql =====
-- =====================================================================
-- Motive: let the Motive admin allow non-LSE emails to sign up, either
-- one address at a time (jo@gmail.com) or a whole domain (@kcl.ac.uk).
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

-- allowed_emails can now hold a whole domain, written as "@kcl.ac.uk".
alter table public.allowed_emails
  add constraint allowed_emails_format check (email ~ '^([^@\s]+)?@[^@\s]+\.[^@\s]+$');

create or replace function public.check_signup_email()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if lower(new.email) like '%@lse.ac.uk'
     or exists (
       select 1 from public.allowed_emails a
       where a.email = lower(new.email)
          or (a.email like '@%' and lower(new.email) like '%' || a.email)
     ) then
    return new;
  end if;
  raise exception 'Motive is only open to @lse.ac.uk email addresses';
end;
$$;

-- ===== 20261020000000_social.sql =====
-- =====================================================================
-- Function: the social side.
--   * Profiles: a short bio and course.
--   * Friends: requests that the other person accepts, and blocking.
--   * Students hosting their own events: public or friends-only, open or
--     "I approve requests", with an optional guest limit. The exact address
--     is only shown to the host and people going.
--   * Messages: a group chat per hosted event, and private messages
--     between friends. Messages can be reported.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Profiles
-- ---------------------------------------------------------------------

alter table public.profiles
  add column bio text check (char_length(bio) <= 160),
  add column course text check (char_length(course) <= 60);

-- Names, photos, course and bio people can see of each other (never emails).
create or replace view public.profile_cards with (security_invoker = false) as
  select id, coalesce(nullif(display_name, ''), 'Member') as name, avatar_url, course, bio
  from public.profiles;
revoke all on public.profile_cards from anon;
grant select on public.profile_cards to authenticated;


-- ---------------------------------------------------------------------
-- 2. Friends and blocking
-- ---------------------------------------------------------------------

create type public.friendship_status as enum ('pending', 'accepted');

create table public.friendships (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       public.friendship_status not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
-- Only one row per pair of people, whoever asked first.
create unique index friendships_one_per_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id);

create table public.user_blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create function public.are_friends(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select a is not null and b is not null and exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a))
  );
$$;

-- Has either person blocked the other?
create function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select a is not null and b is not null and exists (
    select 1 from public.user_blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- People the logged-in user shouldn't see (blocked either way).
create function public.hidden_people()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select blocked_id from public.user_blocks where blocker_id = (select auth.uid())
  union
  select blocker_id from public.user_blocks where blocked_id = (select auth.uid());
$$;

-- Send a friend request. If they've already asked you, you become friends.
-- Returns 'requested', 'accepted' or 'pending' (already asked).
create function public.send_friend_request(target uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  existing public.friendships;
begin
  if uid is null then raise exception 'Log in first'; end if;
  if target = uid then raise exception 'That''s you'; end if;
  if not exists (select 1 from public.profiles where id = target) then raise exception 'Person not found'; end if;
  if public.is_blocked_between(uid, target) then raise exception 'You can''t add this person'; end if;

  select * into existing from public.friendships
  where (requester_id = uid and addressee_id = target) or (requester_id = target and addressee_id = uid);
  if found then
    if existing.status = 'pending' and existing.requester_id = target then
      update public.friendships set status = 'accepted', responded_at = now()
      where requester_id = target and addressee_id = uid;
      return 'accepted';
    end if;
    return existing.status::text;
  end if;

  insert into public.friendships (requester_id, addressee_id) values (uid, target);
  return 'requested';
end;
$$;

create function public.respond_friend_request(from_user uuid, accept boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  if accept then
    update public.friendships set status = 'accepted', responded_at = now()
    where requester_id = from_user and addressee_id = auth.uid() and status = 'pending';
  else
    delete from public.friendships
    where requester_id = from_user and addressee_id = auth.uid() and status = 'pending';
  end if;
end;
$$;

-- Unfriend, or cancel a request you sent.
create function public.remove_friend(other uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.friendships
  where (requester_id = (select auth.uid()) and addressee_id = other)
     or (requester_id = other and addressee_id = (select auth.uid()));
$$;

-- Block someone: also unfriends them.
create function public.block_user(target uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Log in first'; end if;
  if target = uid then raise exception 'That''s you'; end if;
  insert into public.user_blocks (blocker_id, blocked_id) values (uid, target) on conflict do nothing;
  delete from public.friendships
  where (requester_id = uid and addressee_id = target) or (requester_id = target and addressee_id = uid);
end;
$$;

-- How many friends you have in common with someone.
create function public.mutual_friend_count(other uuid)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select count(*) from (
    select case when requester_id = (select auth.uid()) then addressee_id else requester_id end as friend
    from public.friendships
    where status = 'accepted' and (select auth.uid()) in (requester_id, addressee_id)
  ) mine
  where friend <> other and public.are_friends(other, friend);
$$;

-- People you've been to events with, who aren't your friends yet.
create function public.people_you_may_know()
returns table (id uuid, name text, avatar_url text, course text, shared_events bigint)
language sql stable security definer set search_path = ''
as $$
  select p.id, coalesce(nullif(p.display_name, ''), 'Member'), p.avatar_url, p.course, count(distinct mine.event_id)
  from public.event_entries mine
  join public.event_entries theirs on theirs.event_id = mine.event_id and theirs.user_id <> mine.user_id
  join public.profiles p on p.id = theirs.user_id
  where mine.user_id = (select auth.uid())
    and mine.status = 'going' and theirs.status = 'going'
    and not exists (
      select 1 from public.friendships f
      where (f.requester_id = mine.user_id and f.addressee_id = theirs.user_id)
         or (f.requester_id = theirs.user_id and f.addressee_id = mine.user_id)
    )
    and not public.is_blocked_between(mine.user_id, theirs.user_id)
  group by p.id
  order by count(distinct mine.event_id) desc, max(theirs.created_at) desc
  limit 12;
$$;

alter table public.friendships enable row level security;
alter table public.user_blocks enable row level security;

-- You can see requests and friendships you're part of. Changes go through the functions above.
create policy friendships_select on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy user_blocks_select_own on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy user_blocks_delete_own on public.user_blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));


-- ---------------------------------------------------------------------
-- 3. Students hosting their own events
-- ---------------------------------------------------------------------

alter table public.events alter column society_id drop not null;
alter table public.events
  add column host_user_id uuid references public.profiles (id) on delete cascade,
  add column visibility text not null default 'public' check (visibility in ('public', 'friends')),
  add column join_mode text not null default 'open' check (join_mode in ('open', 'approval')),
  add constraint events_one_owner check ((society_id is null) <> (host_user_id is null));
create index events_host_idx on public.events (host_user_id);

-- For hosted events, events.lat/lng is only roughly where it is, and
-- location_note is the area ("Near King's Cross"). The exact spot lives here.
create table public.event_private_details (
  event_id uuid primary key references public.events (id) on delete cascade,
  address  text check (char_length(address) <= 200),
  lat      double precision check (lat between -90 and 90),
  lng      double precision check (lng between -180 and 180)
);

-- Someone asking to join an event that needs the host's approval.
alter type public.entry_status add value if not exists 'requested';

create function public.is_event_host(eid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.events where id = eid and host_user_id = (select auth.uid()) and host_user_id is not null);
$$;

-- Going to the event (not just requested or on the waiting list).
create function public.is_going_to(eid uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  return exists (
    select 1 from public.event_entries
    where event_id = eid and user_id = auth.uid() and status::text = 'going'
  );
end;
$$;

create function public.has_entry(eid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.event_entries where event_id = eid and user_id = (select auth.uid()));
$$;

-- Who can see an event: public ones are open to everyone; friends-only
-- ones to the host, the host's friends, and anyone already on the list.
drop policy events_select_visible on public.events;
create policy events_select_visible on public.events for select to anon, authenticated
  using (
    (not is_hidden
      or (society_id is not null and public.is_society_admin(society_id))
      or host_user_id = (select auth.uid()))
    and (
      host_user_id is null
      or (
        not public.is_blocked_between(host_user_id, (select auth.uid()))
        and (visibility = 'public'
          or host_user_id = (select auth.uid())
          or public.are_friends(host_user_id, (select auth.uid()))
          or public.has_entry(id))
      )
    )
  );

create policy events_insert_by_host on public.events for insert to authenticated
  with check (host_user_id = (select auth.uid()) and society_id is null);
create policy events_update_by_host on public.events for update to authenticated
  using (host_user_id = (select auth.uid())) with check (host_user_id = (select auth.uid()) and society_id is null);
create policy events_delete_by_host on public.events for delete to authenticated
  using (host_user_id = (select auth.uid()));

-- Keep host_user_id fixed after creation, like society_id.
create or replace function public.protect_event_fields()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1
     and (select auth.uid()) is not null
     and not public.is_motive_admin() then
    if tg_op = 'INSERT' then
      new.is_hidden := false;
      new.going_count := 0;
      new.created_by := (select auth.uid());
    else
      new.is_hidden := old.is_hidden;
      new.going_count := old.going_count;
      new.created_by := old.created_by;
      new.society_id := old.society_id;
      new.host_user_id := old.host_user_id;
    end if;
  end if;
  return new;
end;
$$;

alter table public.event_private_details enable row level security;
create policy event_private_details_select on public.event_private_details for select to authenticated
  using (public.is_event_host(event_id) or public.is_going_to(event_id) or public.is_motive_admin());
create policy event_private_details_host on public.event_private_details for all to authenticated
  using (public.is_event_host(event_id)) with check (public.is_event_host(event_id));

create function public.is_hosted_event(eid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.events where id = eid and host_user_id is not null) $$;

-- At hosted events, the host and people going can see who else is coming;
-- the host also sees requests.
create policy event_entries_select_hosted on public.event_entries for select to authenticated
  using (public.is_event_host(event_id) or (public.is_hosted_event(event_id) and public.is_going_to(event_id)));
create policy event_entries_host_delete on public.event_entries for delete to authenticated
  using (public.is_event_host(event_id));

-- Joining now also handles hosted events: friends-only events need you to
-- be the host's friend, and "I approve requests" events put you on the
-- request list until the host says yes.
create or replace function public.join_event(eid uuid, tid uuid default null)
returns public.entry_status
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  ev public.events;
  result public.entry_status;
begin
  if uid is null then raise exception 'Log in first'; end if;
  select * into ev from public.events where id = eid for update;
  if not found or ev.is_hidden or ev.is_cancelled then raise exception 'This event isn''t available'; end if;
  if ev.ends_at < now() then raise exception 'This event has finished'; end if;
  if ev.members_only and ev.society_id is not null and not public.is_society_member(ev.society_id) then
    raise exception 'Only members of this society can join';
  end if;
  -- Hosts run their own event; they don't take a place on the guest list.
  if ev.host_user_id = uid then raise exception 'You''re the host'; end if;
  if ev.host_user_id is not null then
    if public.is_blocked_between(ev.host_user_id, uid) then raise exception 'This event isn''t available'; end if;
    if ev.visibility = 'friends' and not public.are_friends(ev.host_user_id, uid)
       and not exists (select 1 from public.event_entries where event_id = eid and user_id = uid) then
      raise exception 'Only the host''s friends can join';
    end if;
  end if;

  select status into result from public.event_entries where event_id = eid and user_id = uid;
  if found then
    if tid is not null then perform public.choose_table(eid, tid); end if;
    return result;
  end if;

  result := 'going';
  if ev.host_user_id is not null and ev.join_mode = 'approval' then
    result := 'requested';
  elsif ev.format = 'entries' and ev.capacity is not null
     and (select count(*) from public.event_entries where event_id = eid and status = 'going') >= ev.capacity then
    result := 'waitlist';
  end if;

  if tid is not null then
    if ev.format <> 'tables' then raise exception 'This event doesn''t have tables'; end if;
    perform public.assert_seat_free(eid, tid);
  end if;

  insert into public.event_entries (event_id, user_id, status, table_id) values (eid, uid, result, tid);
  return result;
end;
$$;

-- The host accepts or declines someone's request. Accepted people go on
-- the guest list, or the waiting list if the event is full.
create function public.respond_join_request(eid uuid, guest uuid, accept boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.events;
begin
  select * into ev from public.events where id = eid for update;
  if not found or ev.host_user_id is distinct from auth.uid() then raise exception 'Only the host can do that'; end if;
  if not accept then
    delete from public.event_entries where event_id = eid and user_id = guest and status::text = 'requested';
    return;
  end if;
  update public.event_entries
  set status = case
    when ev.capacity is not null
      and (select count(*) from public.event_entries where event_id = eid and status::text = 'going') >= ev.capacity
      then 'waitlist'::public.entry_status
    else 'going'::public.entry_status
  end
  where event_id = eid and user_id = guest and status::text = 'requested';
end;
$$;

-- The host removes a guest; the next person on the waiting list moves up.
create function public.remove_guest(eid uuid, guest uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  was text;
begin
  if not public.is_event_host(eid) then raise exception 'Only the host can do that'; end if;
  perform 1 from public.events where id = eid for update;
  delete from public.event_entries where event_id = eid and user_id = guest returning status::text into was;
  if was = 'going' then perform public.promote_waitlist(eid); end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. Messages: event chats and private messages between friends
-- ---------------------------------------------------------------------

create table public.threads (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid unique references public.events (id) on delete cascade,
  user_a          uuid references public.profiles (id) on delete cascade,
  user_b          uuid references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz,
  check (
    (event_id is not null and user_a is null and user_b is null)
    or (event_id is null and user_a is not null and user_b is not null and user_a < user_b)
  ),
  unique (user_a, user_b)
);

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.threads (id) on delete cascade,
  sender_id  uuid references public.profiles (id) on delete set null,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index messages_thread_idx on public.messages (thread_id, created_at);

-- When you last read each chat, for unread counts.
create table public.thread_reads (
  thread_id    uuid not null references public.threads (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

-- Can the logged-in user read and write in this chat?
--   Private chat: the two people in it, while they're still friends.
--   Event chat: the host and people going.
create function public.can_use_thread(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.threads t
    where t.id = tid and (
      (t.event_id is null
        and (select auth.uid()) in (t.user_a, t.user_b)
        and public.are_friends(t.user_a, t.user_b))
      or (t.event_id is not null
        and (public.is_event_host(t.event_id) or public.is_going_to(t.event_id)))
    )
  );
$$;

-- Open (or create) the private chat with a friend.
create function public.open_dm(other uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  tid uuid;
begin
  if uid is null then raise exception 'Log in first'; end if;
  if not public.are_friends(uid, other) then raise exception 'You can only message friends'; end if;
  insert into public.threads (user_a, user_b) values (least(uid, other), greatest(uid, other))
  on conflict (user_a, user_b) do nothing;
  select id into tid from public.threads where user_a = least(uid, other) and user_b = greatest(uid, other);
  return tid;
end;
$$;

-- Open (or create) the chat for a hosted event.
create function public.open_event_chat(eid uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  tid uuid;
begin
  if not public.is_hosted_event(eid) then
    raise exception 'This event doesn''t have a chat';
  end if;
  if not (public.is_event_host(eid) or public.is_going_to(eid)) then
    raise exception 'Only people going can see the chat';
  end if;
  insert into public.threads (event_id) values (eid) on conflict (event_id) do nothing;
  select id into tid from public.threads where event_id = eid;
  return tid;
end;
$$;

create function public.send_message(tid uuid, body text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  mid uuid;
  clean text := trim(body);
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  if not public.can_use_thread(tid) then raise exception 'You can''t send messages here'; end if;
  if clean = '' then raise exception 'Write a message'; end if;
  if char_length(clean) > 2000 then raise exception 'That message is too long'; end if;
  insert into public.messages (thread_id, sender_id, body) values (tid, auth.uid(), clean) returning id into mid;
  update public.threads set last_message_at = now() where id = tid;
  insert into public.thread_reads (thread_id, user_id, last_read_at) values (tid, auth.uid(), now())
  on conflict (thread_id, user_id) do update set last_read_at = now();
  return mid;
end;
$$;

-- Delete one of your own messages (it shows as "message deleted").
create function public.delete_message(mid uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.messages set deleted_at = now(), body = '(deleted)'
  where id = mid and (sender_id = (select auth.uid()) or public.is_motive_admin());
$$;

create function public.mark_thread_read(tid uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.thread_reads (thread_id, user_id, last_read_at)
  select tid, (select auth.uid()), now() where public.can_use_thread(tid)
  on conflict (thread_id, user_id) do update set last_read_at = now();
$$;

-- Your chats, newest first, with the last message and how many are unread.
create function public.my_threads()
returns table (
  id uuid, event_id uuid, title text, other_id uuid, other_name text, other_avatar text,
  last_body text, last_at timestamptz, last_sender uuid, unread bigint
)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.event_id,
         coalesce(e.title, coalesce(nullif(op.display_name, ''), 'Member')),
         op.id, coalesce(nullif(op.display_name, ''), 'Member'), op.avatar_url,
         lm.body, coalesce(lm.created_at, t.created_at), lm.sender_id,
         (select count(*) from public.messages m
          where m.thread_id = t.id and m.sender_id is distinct from (select auth.uid())
            and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz))
  from public.threads t
  left join public.events e on e.id = t.event_id
  left join public.profiles op on op.id = case when t.user_a = (select auth.uid()) then t.user_b else t.user_a end
                               and t.event_id is null
  left join public.thread_reads r on r.thread_id = t.id and r.user_id = (select auth.uid())
  left join lateral (
    select body, created_at, sender_id from public.messages m
    where m.thread_id = t.id order by created_at desc limit 1
  ) lm on true
  where public.can_use_thread(t.id)
  order by coalesce(lm.created_at, t.created_at) desc
  limit 100;
$$;

create function public.unread_message_count()
returns bigint
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(unread), 0)::bigint from public.my_threads();
$$;

alter table public.threads enable row level security;
alter table public.messages enable row level security;
alter table public.thread_reads enable row level security;

-- Reading goes through these rules; sending goes through send_message().
create policy threads_select on public.threads for select to authenticated
  using (public.can_use_thread(id) or public.is_motive_admin());
create policy messages_select on public.messages for select to authenticated
  using (public.can_use_thread(thread_id) or public.is_motive_admin());
create policy thread_reads_select_own on public.thread_reads for select to authenticated
  using (user_id = (select auth.uid()));


-- ---------------------------------------------------------------------
-- 5. Reporting messages and people
-- ---------------------------------------------------------------------

alter table public.reports
  add column message_id uuid references public.messages (id) on delete cascade,
  add column reported_user_id uuid references public.profiles (id) on delete cascade;
alter table public.reports drop constraint if exists reports_check;
alter table public.reports add constraint reports_has_subject
  check (event_id is not null or society_id is not null or message_id is not null or reported_user_id is not null);

-- ===== 20261021000000_profile_photos.sql =====
-- =====================================================================
-- Function: profile photos.
--
-- Photos go in the "avatars" bucket under a folder named after the
-- person's id, e.g. avatars/<user-id>/<random>.jpg. Anyone can view them;
-- only you can add, replace or delete your own.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- The bucket is public, so photos can be viewed by anyone with the link.
-- Listing files is limited to your own folder (used to tidy up old photos).
create policy avatars_select_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ===== 20261022000000_social_section.sql =====
-- =====================================================================
-- Function: the Social section. Individual students host their own
-- events and others join them. Completely separate from Societies:
-- new tables, new rules, new functions. It only READS profiles,
-- friends and blocks (for names, photos, "friends only" and blocking).
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

create type public.social_category as enum ('sport', 'social', 'study', 'nightlife', 'other');
create type public.social_member_status as enum ('going', 'pending', 'declined');

-- One row per event a student hosts.
create table public.social_events (
  id           uuid primary key default gen_random_uuid(),
  host_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 120),
  category     public.social_category not null,
  description  text check (char_length(description) <= 3000),
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  -- What everyone sees: a place name or area, and a rough map spot.
  area         text not null check (char_length(area) between 1 and 120),
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  -- Spaces include the host: 8 spaces = the host + 7 others.
  spaces       integer not null check (spaces between 2 and 500),
  is_private   boolean not null default false,   -- people request to join and the host approves
  friends_only boolean not null default false,   -- only the host's friends can see it
  is_cancelled boolean not null default false,
  is_hidden    boolean not null default false,   -- set by the Function team after a report
  going_count  integer not null default 0,       -- people going, not counting the host
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index social_events_starts_idx on public.social_events (starts_at);
create index social_events_host_idx on public.social_events (host_id);

-- Who's going, waiting for the host, or was declined.
create table public.social_event_members (
  event_id   uuid not null references public.social_events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  status     public.social_member_status not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (event_id, user_id)
);
create index social_event_members_user_idx on public.social_event_members (user_id);

-- The exact address: only the host and people going can see it.
create table public.social_event_addresses (
  event_id uuid primary key references public.social_events (id) on delete cascade,
  address  text check (char_length(address) <= 200),
  lat      double precision check (lat between -90 and 90),
  lng      double precision check (lng between -180 and 180)
);

-- Reports about a Social event, for the Function team.
create table public.social_reports (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.social_events (id) on delete cascade,
  reporter_id uuid default auth.uid() references public.profiles (id) on delete set null,
  reason      text not null check (char_length(reason) between 1 and 200),
  created_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

create function public.social_is_host(eid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.social_events where id = eid and host_id = (select auth.uid()));
$$;

create function public.social_is_going(eid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.social_event_members
    where event_id = eid and user_id = (select auth.uid()) and status = 'going'
  );
$$;

create function public.social_is_member(eid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.social_event_members where event_id = eid and user_id = (select auth.uid()));
$$;

-- Keep going_count in step with the members list.
create function public.social_refresh_going_count()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  eid uuid := coalesce(new.event_id, old.event_id);
begin
  update public.social_events
  set going_count = (select count(*) from public.social_event_members where event_id = eid and status = 'going')
  where id = eid;
  return null;
end;
$$;

create trigger social_event_members_count
  after insert or update or delete on public.social_event_members
  for each row execute function public.social_refresh_going_count();

-- Hosts can't change who hosts, the count, or the hidden flag.
create function public.social_protect_event_fields()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1 and (select auth.uid()) is not null and not public.is_motive_admin() then
    if tg_op = 'INSERT' then
      new.host_id := (select auth.uid());
      new.going_count := 0;
      new.is_hidden := false;
    else
      new.host_id := old.host_id;
      new.going_count := old.going_count;
      new.is_hidden := old.is_hidden;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger social_events_protect
  before insert or update on public.social_events
  for each row execute function public.social_protect_event_fields();


-- ---------------------------------------------------------------------
-- Joining, requesting, approving and leaving
-- ---------------------------------------------------------------------

-- "I'm in" (open events) or "Request to join" (private events).
-- Returns 'going' or 'pending'.
create function public.social_join(eid uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  ev public.social_events;
  existing public.social_member_status;
begin
  if uid is null then raise exception 'Log in first'; end if;
  select * into ev from public.social_events where id = eid for update;
  if not found or ev.is_hidden or ev.is_cancelled then raise exception 'This event isn''t available'; end if;
  if ev.ends_at < now() then raise exception 'This event has finished'; end if;
  if ev.host_id = uid then raise exception 'You''re hosting this event'; end if;
  if public.is_blocked_between(ev.host_id, uid) then raise exception 'This event isn''t available'; end if;
  if ev.friends_only and not public.are_friends(ev.host_id, uid) then raise exception 'Only the host''s friends can join'; end if;

  select status into existing from public.social_event_members where event_id = eid and user_id = uid;
  if found then
    if existing = 'declined' then raise exception 'The host declined your request'; end if;
    return existing::text;
  end if;

  -- The host takes one space.
  if ev.going_count + 1 >= ev.spaces then raise exception 'This event is full'; end if;

  insert into public.social_event_members (event_id, user_id, status)
  values (eid, uid, case when ev.is_private then 'pending' else 'going' end::public.social_member_status);
  return case when ev.is_private then 'pending' else 'going' end;
end;
$$;

-- Leave an event, or withdraw a request.
create function public.social_leave(eid uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.social_event_members
  where event_id = eid and user_id = (select auth.uid()) and status in ('going', 'pending');
$$;

-- The host approves or declines a request.
create function public.social_respond(eid uuid, guest uuid, approve boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.social_events;
begin
  select * into ev from public.social_events where id = eid for update;
  if not found or ev.host_id is distinct from auth.uid() then raise exception 'Only the host can do that'; end if;
  if approve and ev.going_count + 1 >= ev.spaces then raise exception 'The event is full'; end if;
  update public.social_event_members
  set status = case when approve then 'going' else 'declined' end::public.social_member_status,
      decided_at = now()
  where event_id = eid and user_id = guest and status = 'pending';
  if not found then raise exception 'That request isn''t waiting any more'; end if;
end;
$$;

-- The host removes someone who's going.
create function public.social_remove_guest(eid uuid, guest uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.social_is_host(eid) then raise exception 'Only the host can do that'; end if;
  delete from public.social_event_members where event_id = eid and user_id = guest and status = 'going';
end;
$$;


-- ---------------------------------------------------------------------
-- Security rules
-- ---------------------------------------------------------------------

alter table public.social_events enable row level security;
alter table public.social_event_members enable row level security;
alter table public.social_event_addresses enable row level security;
alter table public.social_reports enable row level security;

-- Who can see an event: everyone (including people not logged in, so
-- shared links work), unless it's friends-only, hidden after a report,
-- or between people who've blocked each other.
create policy social_events_select on public.social_events for select to anon, authenticated
  using (
    host_id = (select auth.uid())
    or public.is_motive_admin()
    or (
      not is_hidden
      and not public.is_blocked_between(host_id, (select auth.uid()))
      and (not friends_only or public.are_friends(host_id, (select auth.uid())) or public.social_is_member(id))
    )
  );
create policy social_events_insert on public.social_events for insert to authenticated
  with check (host_id = (select auth.uid()));
create policy social_events_update on public.social_events for update to authenticated
  using (host_id = (select auth.uid()) or public.is_motive_admin())
  with check (host_id = (select auth.uid()) or public.is_motive_admin());
create policy social_events_delete on public.social_events for delete to authenticated
  using (host_id = (select auth.uid()) or public.is_motive_admin());

-- Members: you see your own; the host sees everyone; people going see who else is going.
-- Changes only happen through the functions above.
create policy social_event_members_select on public.social_event_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.social_is_host(event_id)
    or (status = 'going' and public.social_is_going(event_id))
    or public.is_motive_admin()
  );

create policy social_event_addresses_select on public.social_event_addresses for select to authenticated
  using (public.social_is_host(event_id) or public.social_is_going(event_id) or public.is_motive_admin());
create policy social_event_addresses_host on public.social_event_addresses for all to authenticated
  using (public.social_is_host(event_id)) with check (public.social_is_host(event_id));

create policy social_reports_insert on public.social_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy social_reports_admin on public.social_reports for all to authenticated
  using (public.is_motive_admin()) with check (public.is_motive_admin());

-- ===== 20261023000000_profile_upgrade.sql =====
-- =====================================================================
-- Function: profile upgrade.
--   * Societies on profiles: a READ-ONLY function that lists someone's
--     approved memberships and committee roles. No Societies table,
--     rule or code is changed.
--   * "My 5": up to 5 current photos per person. Each lasts 30 days
--     unless pinned, then moves to the owner's private Archive.
--   * Reporting photos, for the Function team to review.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Profile settings (kept separate from the shared profiles table)
-- ---------------------------------------------------------------------

create table public.profile_settings (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  show_societies boolean not null default true
);

alter table public.profile_settings enable row level security;
create policy profile_settings_own on public.profile_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));


-- ---------------------------------------------------------------------
-- 2. Societies someone belongs to (read-only)
-- ---------------------------------------------------------------------

-- Approved memberships and committee roles, for showing on a profile.
-- Only for logged-in people; empty if the person has hidden them (unless
-- it's you) or if either of you has blocked the other.
create function public.profile_societies(person uuid)
returns table (id uuid, name text, slug text, logo_url text, is_committee boolean)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.name, s.slug, s.logo_url, bool_or(r.committee)
  from (
    select society_id, false as committee from public.society_members where user_id = person and status = 'approved'
    union all
    select society_id, true from public.society_admins where user_id = person
  ) r
  join public.societies s on s.id = r.society_id
  where (select auth.uid()) is not null
    and not public.is_blocked_between(person, (select auth.uid()))
    and (
      person = (select auth.uid())
      or coalesce((select show_societies from public.profile_settings where user_id = person), true)
    )
  group by s.id, s.name, s.slug, s.logo_url
  order by bool_or(r.committee) desc, s.name;
$$;
revoke execute on function public.profile_societies(uuid) from public, anon;
grant execute on function public.profile_societies(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 3. "My 5" photos
-- ---------------------------------------------------------------------

-- Private storage: photos are shown through short-lived links that only
-- logged-in people can get.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create table public.profile_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  path         text not null unique,   -- <user-id>/<random>.jpg in the profile-photos bucket
  created_at   timestamptz not null default now(),
  activated_at timestamptz not null default now(),   -- the 30 days count from here
  pinned       boolean not null default false,       -- pinned photos never expire
  archived_at  timestamptz                           -- moved to the Archive by hand
);
create index profile_photos_user_idx on public.profile_photos (user_id, activated_at desc);

-- A photo is on the profile if it hasn't been archived and is pinned or
-- under 30 days old. Everything else is in the owner's Archive.
create function public.current_photo_count(person uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.profile_photos p
  where p.user_id = person and p.archived_at is null and (p.pinned or p.activated_at > now() - interval '30 days');
$$;

-- Add a photo you've uploaded. Needs a free space.
create function public.add_profile_photo(photo_path text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  pid uuid;
begin
  if uid is null then raise exception 'Log in first'; end if;
  if split_part(photo_path, '/', 1) <> uid::text then raise exception 'Not your photo'; end if;
  perform 1 from public.profiles where id = uid for update;  -- one upload at a time per person
  if public.current_photo_count(uid) >= 5 then
    raise exception 'All 5 spaces are full. Remove or archive a photo first.';
  end if;
  insert into public.profile_photos (user_id, path) values (uid, photo_path) returning id into pid;
  return pid;
end;
$$;

create function public.archive_profile_photo(pid uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.profile_photos set archived_at = now(), pinned = false
  where id = pid and user_id = (select auth.uid());
$$;

-- Put a photo from the Archive back on your profile, for a fresh 30 days.
create function public.restore_profile_photo(pid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  perform 1 from public.profiles where id = uid for update;
  if not exists (select 1 from public.profile_photos where id = pid and user_id = uid) then raise exception 'Photo not found'; end if;
  if public.current_photo_count(uid) >= 5 then
    raise exception 'All 5 spaces are full. Remove or archive a photo first.';
  end if;
  update public.profile_photos set archived_at = null, activated_at = now(), pinned = false where id = pid;
end;
$$;

-- Pin (never expires) or unpin a photo that's on your profile.
-- Unpinning gives it a fresh 30 days, so it doesn't vanish straight away.
create function public.pin_profile_photo(pid uuid, pin boolean)
returns void
language sql security definer set search_path = ''
as $$
  update public.profile_photos
  set pinned = pin, activated_at = case when pin then activated_at else now() end
  where id = pid and user_id = (select auth.uid()) and archived_at is null
    and (pinned or activated_at > now() - interval '30 days');
$$;

alter table public.profile_photos enable row level security;

-- You see all your own photos (including the Archive). Other logged-in
-- people see only current ones, unless one of you has blocked the other.
create policy profile_photos_select on public.profile_photos for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_motive_admin()
    or (
      archived_at is null and (pinned or activated_at > now() - interval '30 days')
      and not public.is_blocked_between(user_id, (select auth.uid()))
    )
  );
create policy profile_photos_delete_own on public.profile_photos for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_motive_admin());

-- Storage rules for the photo files themselves.
create policy profile_photos_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy profile_photos_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'profile-photos' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_motive_admin()));
create policy profile_photos_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-photos' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_motive_admin()
      or exists (
        select 1 from public.profile_photos p
        where p.path = name and p.archived_at is null
          and (p.pinned or p.activated_at > now() - interval '30 days')
          and not public.is_blocked_between(p.user_id, (select auth.uid()))
      )
    )
  );


-- ---------------------------------------------------------------------
-- 4. Reporting photos
-- ---------------------------------------------------------------------

create table public.profile_photo_reports (
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null references public.profile_photos (id) on delete cascade,
  reporter_id uuid default auth.uid() references public.profiles (id) on delete set null,
  reason      text not null check (char_length(reason) between 1 and 200),
  status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now()
);

alter table public.profile_photo_reports enable row level security;
create policy profile_photo_reports_insert on public.profile_photo_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open');
create policy profile_photo_reports_admin on public.profile_photo_reports for all to authenticated
  using (public.is_motive_admin()) with check (public.is_motive_admin());

-- ===== 20261024000000_food_category.sql =====
-- Item 4: a "Food" category for Social events. Only adds a new choice;
-- nothing existing changes.
alter type public.social_category add value if not exists 'food';

-- ===== 20261024000001_learn_category.sql =====
-- Follow-up: a "Learn" category for Social events (workshops, skills,
-- talks by students). Only adds a new choice; nothing existing changes.
alter type public.social_category add value if not exists 'learn';

-- ===== 20261025000000_social_event_cost.sql =====
-- Item 6: an optional cost on Social events, display only (no payments).
-- Stored in pence: empty = not given, 0 = Free, 600 = £6. Only adds a column.
alter table public.social_events add column if not exists cost_pence integer
  check (cost_pence is null or (cost_pence >= 0 and cost_pence <= 100000));

-- ===== 20261026000000_society_event_cost.sql =====
-- Item 7: the same optional cost on society events, display only.
-- Stored in pence: empty = not given, 0 = Free, 600 = £6. Only adds a column.
alter table public.events add column if not exists cost_pence integer
  check (cost_pence is null or (cost_pence >= 0 and cost_pence <= 100000));

-- ===== 20261027000000_social_event_chats.sql =====
-- Item 8: every Social event gets a group chat, named after the event.
-- It reuses the existing chats (threads and messages). Who's in the chat
-- isn't stored: the host and everyone going can use it, so joining adds you,
-- leaving or being removed takes you out, and the host is always in.
-- Only adds things: one new column, a trigger, and updated chat rules.

-- 1. A chat can now belong to a Social event.
alter table public.threads add column if not exists social_event_id uuid unique
  references public.social_events (id) on delete cascade;

-- The old rule said a chat is either an event chat or a two-person chat;
-- swap it for one that also allows a Social event chat (existing chats all
-- still pass).
alter table public.threads drop constraint if exists threads_check;
alter table public.threads add constraint threads_kind_check check (
  (event_id is not null and social_event_id is null and user_a is null and user_b is null)
  or (social_event_id is not null and event_id is null and user_a is null and user_b is null)
  or (event_id is null and social_event_id is null and user_a is not null and user_b is not null and user_a < user_b)
);

-- 2. Who can read and write in a chat: as before, plus the host and people
--    going for a Social event chat.
create or replace function public.can_use_thread(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.threads t
    where t.id = tid and (
      (t.event_id is null and t.social_event_id is null
        and (select auth.uid()) in (t.user_a, t.user_b)
        and public.are_friends(t.user_a, t.user_b))
      or (t.event_id is not null
        and (public.is_event_host(t.event_id) or public.is_going_to(t.event_id)))
      or (t.social_event_id is not null
        and (public.social_is_host(t.social_event_id) or public.social_is_going(t.social_event_id)))
    )
  );
$$;

-- 3. Every new Social event gets its chat straight away...
create or replace function public.social_event_create_chat()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.threads (social_event_id) values (new.id) on conflict (social_event_id) do nothing;
  return new;
end;
$$;

drop trigger if exists social_events_create_chat on public.social_events;
create trigger social_events_create_chat after insert on public.social_events
  for each row execute function public.social_event_create_chat();

-- ...and so does every Social event that already exists.
insert into public.threads (social_event_id)
select id from public.social_events
on conflict (social_event_id) do nothing;

-- 4. The chat list: as before, plus the Social event's title and id.
--    (Adding a column to what it returns means re-creating it.)
drop function if exists public.my_threads();
create function public.my_threads()
returns table (
  id uuid, event_id uuid, title text, other_id uuid, other_name text, other_avatar text,
  last_body text, last_at timestamptz, last_sender uuid, unread bigint, social_event_id uuid
)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.event_id,
         coalesce(e.title, se.title, coalesce(nullif(op.display_name, ''), 'Member')),
         op.id, coalesce(nullif(op.display_name, ''), 'Member'), op.avatar_url,
         lm.body, coalesce(lm.created_at, t.created_at), lm.sender_id,
         (select count(*) from public.messages m
          where m.thread_id = t.id and m.sender_id is distinct from (select auth.uid())
            and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)),
         t.social_event_id
  from public.threads t
  left join public.events e on e.id = t.event_id
  left join public.social_events se on se.id = t.social_event_id
  left join public.profiles op on op.id = case when t.user_a = (select auth.uid()) then t.user_b else t.user_a end
                               and t.event_id is null and t.social_event_id is null
  left join public.thread_reads r on r.thread_id = t.id and r.user_id = (select auth.uid())
  left join lateral (
    select body, created_at, sender_id from public.messages m
    where m.thread_id = t.id order by created_at desc limit 1
  ) lm on true
  where public.can_use_thread(t.id)
  order by coalesce(lm.created_at, t.created_at) desc
  limit 100;
$$;

-- ===== 20261028000000_photos_stay.sql =====
-- Item 12: profile photos no longer expire after 30 days. A photo stays on
-- the profile until its owner removes it (to the Archive) or deletes it.
-- Nothing is deleted; no tables or columns are removed or renamed.

-- 1. Photos that already ran out are in their owner's Archive today. Mark
--    them as archived (dated when they ran out) so they stay there.
update public.profile_photos
set archived_at = activated_at + interval '30 days'
where archived_at is null and not pinned and activated_at <= now() - interval '30 days';

-- 2. A photo is on the profile if it hasn't been archived. (These replace
--    the versions with the 30-day rule; same names and inputs.)
create or replace function public.current_photo_count(person uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.profile_photos p
  where p.user_id = person and p.archived_at is null;
$$;

create or replace function public.pin_profile_photo(pid uuid, pin boolean)
returns void
language sql security definer set search_path = ''
as $$
  update public.profile_photos set pinned = pin
  where id = pid and user_id = (select auth.uid()) and archived_at is null;
$$;

-- 3. Who can see a photo: the owner always; other people while it's on the
--    profile (not archived), unless one of you has blocked the other.
alter policy profile_photos_select on public.profile_photos
  using (
    user_id = (select auth.uid())
    or public.is_motive_admin()
    or (archived_at is null and not public.is_blocked_between(user_id, (select auth.uid())))
  );

alter policy profile_photos_files_select on storage.objects
  using (
    bucket_id = 'profile-photos' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_motive_admin()
      or exists (
        select 1 from public.profile_photos p
        where p.path = name and p.archived_at is null
          and not public.is_blocked_between(p.user_id, (select auth.uid()))
      )
    )
  );

-- ===== 20261029000000_photo_order.sql =====
-- Item 14: people choose the order of their profile photos (the first is
-- shown first). Only adds a column and a function.
alter table public.profile_photos add column if not exists position integer;

-- Save a new order: the ids of your photos, first to last.
create or replace function public.reorder_profile_photos(ids uuid[])
returns void
language sql security definer set search_path = ''
as $$
  update public.profile_photos p set position = o.i
  from unnest(ids) with ordinality as o(id, i)
  where p.id = o.id and p.user_id = (select auth.uid());
$$;

-- ===== 20261030000000_profile_prompts.sql =====
-- Item 17: profile prompts (like Hinge) replace "About me". Each person
-- answers up to 3 questions from the app's list. The old "About me" text
-- (profiles.bio) is kept exactly as it is, just no longer shown.
-- Only adds a table and a function.

create table if not exists public.profile_prompts (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  prompt_id  text not null check (char_length(prompt_id) between 1 and 40),
  answer     text not null check (char_length(answer) between 1 and 150),
  position   smallint not null check (position between 0 and 2),
  updated_at timestamptz not null default now(),
  primary key (user_id, prompt_id)
);

alter table public.profile_prompts enable row level security;

-- Logged-in people can read answers, unless one of you has blocked the other.
-- Changes go through save_profile_prompts() below.
drop policy if exists profile_prompts_select on public.profile_prompts;
create policy profile_prompts_select on public.profile_prompts for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_motive_admin()
    or not public.is_blocked_between(user_id, (select auth.uid()))
  );

-- Save your answers (a list of up to 3 {prompt_id, answer}), replacing the
-- ones you had.
create or replace function public.save_profile_prompts(answers jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Log in first'; end if;
  if jsonb_typeof(answers) <> 'array' then raise exception 'Something went wrong. Please try again.'; end if;
  if jsonb_array_length(answers) > 3 then raise exception 'You can answer up to 3 prompts'; end if;
  delete from public.profile_prompts where user_id = uid;
  insert into public.profile_prompts (user_id, prompt_id, answer, position)
  select uid, a->>'prompt_id', trim(a->>'answer'), (n - 1)::smallint
  from jsonb_array_elements(answers) with ordinality as t(a, n);
end;
$$;
revoke execute on function public.save_profile_prompts(jsonb) from public, anon;
grant execute on function public.save_profile_prompts(jsonb) to authenticated;

-- ===== test-project marker (not from the app's code; added by check/build.py) =====
-- Lets the test accounts (@staging.studentfunction.com) sign up, and marks this
-- database as the TEST project: parts 2 onwards and 90-test-accounts.sql
-- refuse to run where this line is missing (like the real project).
insert into public.allowed_emails (email, note) values ('@staging.studentfunction.com', 'Test accounts (test project only)') on conflict (email) do nothing;
