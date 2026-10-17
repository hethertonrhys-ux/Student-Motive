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
