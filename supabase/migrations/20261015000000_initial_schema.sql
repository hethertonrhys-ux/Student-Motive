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
