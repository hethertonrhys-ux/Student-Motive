-- Feature requests, Founding Society progress and the Function team's Hub
-- view (Part 4 of the Society Hub).
--
-- Adds:
--   - feature_requests: a society's committee asks for a feature ("What do
--     you need? How do you do it now?"). The committee sees and adds its own
--     society's requests; only Function admins see them all and change
--     their status. Setting a request to 'live' sends the society's managers
--     a Society Hub push.
--   - Founding Society progress, worked out from the society's events (never
--     stored): events posted since agreeing, prize-draw eligibility, and
--     whether the Founding Society badge is on.
--   - Lists for the Function team: the requests queue, the coming-soon
--     features ranked by how many societies want each, and every Founding
--     Society's progress.
--   - queue_hub_reminders(): a weekly nudge for Founding Societies that
--     haven't posted for 7 days. Run daily by supabase/RUN_ONCE_hub_cron.sql.
--
-- Only adds things (nothing is dropped, renamed or deleted), and is safe to
-- run more than once. Societies already on Function see no change: none of
-- them is a Founding Society, so no badge, progress or nudge applies to them.

-- ---------------------------------------------------------------------
-- 1. Feature requests
-- ---------------------------------------------------------------------

create table if not exists public.feature_requests (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies (id) on delete cascade,
  requested_by uuid references public.profiles (id) on delete set null default auth.uid(),
  need text not null check (length(trim(need)) between 3 and 1000),
  current_process text check (current_process is null or length(current_process) <= 1000),
  status text not null default 'new' check (status in ('new', 'building', 'live', 'declined')),
  admin_note text check (admin_note is null or length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status_changed_at timestamptz
);
create index if not exists feature_requests_status_idx on public.feature_requests (status, created_at);
create index if not exists feature_requests_society_idx on public.feature_requests (society_id, created_at);
alter table public.feature_requests enable row level security;

-- The society's own managers (not every Function admin through
-- is_society_admin, though admins see everything anyway) read their
-- society's requests and add new ones in their own name. Only Function
-- admins change or delete them.
drop policy if exists feature_requests_select on public.feature_requests;
create policy feature_requests_select on public.feature_requests
  for select to authenticated
  using (public.is_society_committee(society_id) or public.is_motive_admin());
drop policy if exists feature_requests_insert on public.feature_requests;
create policy feature_requests_insert on public.feature_requests
  for insert to authenticated
  with check (public.is_society_committee(society_id) and requested_by = (select auth.uid())
              and status = 'new' and admin_note is null);
drop policy if exists feature_requests_update on public.feature_requests;
create policy feature_requests_update on public.feature_requests
  for update to authenticated
  using (public.is_motive_admin()) with check (public.is_motive_admin());
drop policy if exists feature_requests_delete on public.feature_requests;
create policy feature_requests_delete on public.feature_requests
  for delete to authenticated using (public.is_motive_admin());

revoke all on table public.feature_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.feature_requests to authenticated;

-- Dates are the server's: a new request starts now (whatever the app
-- sent), and every change stamps updated_at, plus status_changed_at when the
-- status changes. Who asked, for which society and when never change for
-- people using the app (the database's own scripts, with no logged-in user,
-- are left alone). Only changes made directly count as "from the app"
-- (pg_trigger_depth() = 1): when someone deletes their account, the
-- database itself clears requested_by on their requests, and that must go
-- through.
create or replace function public.feature_requests_stamp()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if pg_trigger_depth() = 1 and (select auth.uid()) is not null then
      new.created_at := now();
      new.updated_at := now();
      new.status_changed_at := null;
    end if;
    return new;
  end if;
  new.updated_at := now();
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  if pg_trigger_depth() = 1 and (select auth.uid()) is not null then
    new.id := old.id;
    new.society_id := old.society_id;
    new.requested_by := old.requested_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
revoke execute on function public.feature_requests_stamp() from public, anon, authenticated;
drop trigger if exists feature_requests_stamp on public.feature_requests;
create trigger feature_requests_stamp before insert or update on public.feature_requests
  for each row execute function public.feature_requests_stamp();

-- A request goes live: every manager of that society gets a Society Hub
-- push, once per request (the dedupe key stops repeats if it goes back and
-- forth). The push opens the society's dashboard, which every app build has:
-- app builds already in the stores have no Hub screens, and a tap on a
-- phone opens the link inside the app. Switch it to
-- '/hub/' || society_id || '/requests' once an app build with the Hub is out.
create or replace function public.push_on_request_live()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  manager uuid;
begin
  for manager in select a.user_id from public.society_admins a where a.society_id = new.society_id loop
    perform public.queue_push(manager, 'hub', 'Your feature request is live', left(new.need, 100),
                              '/dashboard/' || new.society_id, 'request-live:' || new.id || ':' || manager);
  end loop;
  return null;
end;
$$;
revoke execute on function public.push_on_request_live() from public, anon, authenticated;
drop trigger if exists feature_requests_push_live on public.feature_requests;
create trigger feature_requests_push_live after update of status on public.feature_requests
  for each row when (new.status = 'live' and old.status is distinct from 'live')
  execute function public.push_on_request_live();

-- ---------------------------------------------------------------------
-- 2. Founding Society progress (worked out, never stored)
-- ---------------------------------------------------------------------
--
-- Definitions (packages/shared/src/founding.ts follows the same ones; keep
-- the two in step):
--   - A "published event" is an event of the society that isn't cancelled
--     and isn't hidden by the Function team. society_published_events() is
--     the one place this is decided (Part 5 also leaves out drafts there).
--   - "Events posted since agreeing": published events created at or after
--     the Founding Society agreement (agreed_at).
--   - "Prize-draw eligible": at least events_target (3) of those, each with
--     at least one person going.
--   - "Last event": the newest created_at among the society's published
--     events (any time, before agreeing too).
--   - "Badge on": a Founding Society that has agreed, and whose last event or
--     agreement (whichever is later) is less than 30 days old. So the badge
--     turns off after 30 days without a new published event, and comes back
--     as soon as they post again.

-- Every number above comes from events.created_at, so people using the app
-- can't set it: a new event is created now (whatever the app sent), and
-- created_at never changes after that. Otherwise a manager could keep the
-- badge on for good or move old events into "since agreeing". This is the
-- 20261020000000_social.sql version with the two created_at lines added (the
-- app never sends created_at); the events_protect_fields trigger already
-- uses it, and its grants stay as they are. Part 5 must keep both lines
-- when it changes this function.
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
      new.created_at := now();
    else
      new.is_hidden := old.is_hidden;
      new.going_count := old.going_count;
      new.created_by := old.created_by;
      new.society_id := old.society_id;
      new.host_user_id := old.host_user_id;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;

-- The society's published events. Server-only: other database functions
-- use it; nobody calls it from the app.
create or replace function public.society_published_events(sid uuid)
returns table (id uuid, created_at timestamptz, starts_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select e.id, e.created_at, e.starts_at
  from public.events e
  where e.society_id = sid
    and not e.is_cancelled
    and not e.is_hidden
$$;
revoke execute on function public.society_published_events(uuid) from public, anon, authenticated;

-- Everything about one society's Founding progress, for any society (zeros
-- and nulls when it isn't Founding or hasn't agreed). No rows if the
-- society doesn't exist. Server-only: founding_progress,
-- founding_badge_active, admin_founding_societies and queue_hub_reminders
-- decide who sees what.
create or replace function public.founding_status(sid uuid)
returns table (is_founding boolean, agreed_at timestamptz, events_target integer, events_since integer,
               events_with_rsvp integer, last_event_at timestamptz, days_since_last_event integer,
               eligible boolean, badge_active boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  founding boolean;
  agreed timestamptz;
  target integer;
  since integer := 0;
  with_rsvp integer := 0;
  last_at timestamptz;
begin
  select s.is_founding, a.agreed_at, coalesce(a.events_target, 3)
    into founding, agreed, target
    from public.societies s
    left join public.founding_agreements a on a.society_id = s.id
   where s.id = sid;
  if not found then
    return;
  end if;
  select max(e.created_at) into last_at from public.society_published_events(sid) e;
  if agreed is not null then
    select count(*)::integer,
           (count(*) filter (where exists (select 1 from public.event_entries x
                                           where x.event_id = e.id and x.status = 'going')))::integer
      into since, with_rsvp
      from public.society_published_events(sid) e
     where e.created_at >= agreed;
  end if;
  return query select
    founding,
    agreed,
    target,
    since,
    with_rsvp,
    last_at,
    case when last_at is null then null else floor(extract(epoch from (now() - last_at)) / 86400)::integer end,
    coalesce(founding and agreed is not null and with_rsvp >= target, false),
    coalesce(founding and agreed is not null and greatest(last_at, agreed) > now() - interval '30 days', false);
end;
$$;
revoke execute on function public.founding_status(uuid) from public, anon, authenticated;

-- Whether a society's page shows the Founding Society badge. Anyone may ask
-- (logged out too): it says nothing but the badge.
create or replace function public.founding_badge_active(sid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select f.badge_active from public.founding_status(sid) f), false)
$$;
revoke execute on function public.founding_badge_active(uuid) from public;
grant execute on function public.founding_badge_active(uuid) to anon, authenticated;

-- The Hub's progress card: only the society's managers (and Function
-- admins); anyone else gets no rows.
create or replace function public.founding_progress(sid uuid)
returns table (is_founding boolean, agreed_at timestamptz, events_target integer, events_since integer,
               events_with_rsvp integer, last_event_at timestamptz, days_since_last_event integer,
               eligible boolean, badge_active boolean)
language sql stable security definer set search_path = ''
as $$
  select f.is_founding, f.agreed_at, f.events_target, f.events_since, f.events_with_rsvp,
         f.last_event_at, f.days_since_last_event, f.eligible, f.badge_active
  from public.founding_status(sid) f
  where public.is_society_admin(sid)
$$;
revoke execute on function public.founding_progress(uuid) from public, anon;
grant execute on function public.founding_progress(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. The Function team's Hub view (admins only)
-- ---------------------------------------------------------------------

-- Every Founding Society (agreed or not; agreed_at is null until they have)
-- with its progress.
create or replace function public.admin_founding_societies()
returns table (society_id uuid, name text, slug text, university text, agreed_at timestamptz,
               events_target integer, events_since integer, events_with_rsvp integer,
               last_event_at timestamptz, days_since_last_event integer, eligible boolean, badge_active boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_motive_admin() then
    raise exception 'Function admins only';
  end if;
  return query
    select s.id, s.name, s.slug, s.university, f.agreed_at, f.events_target, f.events_since,
           f.events_with_rsvp, f.last_event_at, f.days_since_last_event, f.eligible, f.badge_active
    from public.societies s
    cross join lateral public.founding_status(s.id) f
    where s.is_founding
    order by s.name, s.id;
end;
$$;
revoke execute on function public.admin_founding_societies() from public, anon;
grant execute on function public.admin_founding_societies() to authenticated;

-- The features societies have said "We want this" to, most wanted first.
create or replace function public.admin_feature_interest()
returns table (feature_key text, societies integer, society_names text[])
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_motive_admin() then
    raise exception 'Function admins only';
  end if;
  return query
    select i.feature_key, count(*)::integer, array_agg(s.name order by s.name)
    from public.feature_interest i
    join public.societies s on s.id = i.society_id
    group by i.feature_key
    order by count(*) desc, i.feature_key;
end;
$$;
revoke execute on function public.admin_feature_interest() from public, anon;
grant execute on function public.admin_feature_interest() to authenticated;

-- The requests queue, newest first, optionally one status only. Who asked is
-- a name (as elsewhere: the display name, else the full name, else
-- 'Member'), never an email; null if their account has been deleted.
create or replace function public.admin_feature_requests(status_filter text default null)
returns table (id uuid, society_id uuid, society_name text, society_slug text, university text, need text,
               current_process text, status text, admin_note text, created_at timestamptz,
               status_changed_at timestamptz, requested_by_name text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_motive_admin() then
    raise exception 'Function admins only';
  end if;
  return query
    select r.id, r.society_id, s.name, s.slug, s.university, r.need, r.current_process, r.status,
           r.admin_note, r.created_at, r.status_changed_at,
           case when p.id is null then null
                else coalesce(nullif(p.display_name, ''), nullif(p.full_name, ''), 'Member') end
    from public.feature_requests r
    join public.societies s on s.id = r.society_id
    left join public.profiles p on p.id = r.requested_by
    where status_filter is null or r.status = status_filter
    order by r.created_at desc, r.id
    limit 500;
end;
$$;
revoke execute on function public.admin_feature_requests(text) from public, anon;
grant execute on function public.admin_feature_requests(text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Reminders (run daily by supabase/RUN_ONCE_hub_cron.sql)
-- ---------------------------------------------------------------------

-- Founding Societies that have agreed but haven't posted a new event (or
-- agreed) for more than 7 days: each manager gets a Society Hub push, at
-- most once every 7 days per manager and society (a nudge is skipped if one
-- went in the last six and a half days; the dedupe key also has the week in
-- it, which stops repeats on the same day). Returns how many
-- pushes were queued. Server-only. Part 5 adds the event admin reminders
-- here too.
-- The push opens the society's dashboard, which every app build has (app
-- builds in the stores have no Hub screens yet). Switch it to '/hub/' ||
-- society id once an app build with the Hub is out.
create or replace function public.queue_hub_reminders()
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r record;
  manager uuid;
  k text;
  queued integer := 0;
  week bigint := floor(extract(epoch from now()) / 604800)::bigint;
begin
  for r in
    select s.id, f.events_since, f.events_target
    from public.societies s
    cross join lateral public.founding_status(s.id) f
    where s.is_founding
      and f.agreed_at is not null
      and greatest(f.last_event_at, f.agreed_at) < now() - interval '7 days'
  loop
    for manager in select a.user_id from public.society_admins a where a.society_id = r.id loop
      k := 'founding-nudge:' || r.id || ':' || manager || ':' || week;
      continue when exists (select 1 from public.push_queue q where q.dedupe_key = k);
      continue when exists (select 1 from public.push_queue q
                            where q.user_id = manager
                              and q.dedupe_key like 'founding-nudge:' || r.id || ':' || manager || ':%'
                              and q.created_at > now() - interval '6 days 12 hours');
      perform public.queue_push(manager, 'hub', 'Time to post your next event?',
                                least(r.events_since, r.events_target) || ' of ' || r.events_target
                                  || ' events posted. Post your next one to keep your Founding badge.',
                                '/dashboard/' || r.id, k);
      if exists (select 1 from public.push_queue q where q.dedupe_key = k) then
        queued := queued + 1;
      end if;
    end loop;
  end loop;
  return queued;
end;
$$;
revoke execute on function public.queue_hub_reminders() from public, anon, authenticated;
