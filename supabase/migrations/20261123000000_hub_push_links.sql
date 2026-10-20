-- Society Hub push links. The next App Store build includes the Society
-- Hub, so the three Society Hub notifications that opened the society's
-- dashboard (every earlier app build has that screen; none had the Hub) now
-- open the Hub instead.
--
-- Runs after 20261122000000_event_admin_documents.sql. Nothing in
-- supabase/RUN_ONCE_hub_cron.sql needs running again: the daily timer calls
-- queue_hub_reminders() by name, so it picks up the new version.
--
-- Changes:
--   - add_society_manager(): the "You're now a manager of ..." push opens
--     '/hub/<society id>' and says "Open the Society Hub to see it."
--   - push_on_request_live(): the "Your feature request is live" push opens
--     '/hub/<society id>/requests'.
--   - queue_hub_reminders(): the weekly Founding nudge opens
--     '/hub/<society id>'. The event admin checklist reminders still open
--     the event's manage screen ('/dashboard/<society id>/events/<event id>'),
--     where the Event admin card is.
-- Each function is an exact copy of its latest definition with only those
-- lines changed, and keeps its grants and revokes (re-stated below).
--
-- An older app build without the Hub screens (only TestFlight testers have
-- one) opens "not found" from these three notifications. That's acceptable:
-- updating the app fixes it.
--
-- Only replaces functions (nothing is dropped, renamed or deleted) and is
-- safe to run more than once. Societies see no other change: only where
-- these notifications open, and the wording of the "now a manager" one.

-- ---------------------------------------------------------------------
-- 1. Adding a manager
-- ---------------------------------------------------------------------

-- As in 20261119000000_society_hub.sql, but the push opens the society's
-- Hub and says "Open the Society Hub to see it."
create or replace function public.add_society_manager(sid uuid, person uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  sname text;
begin
  if sid is null or not (public.is_society_committee(sid) or public.is_motive_admin()) then
    raise exception 'Only the society''s managers can do this';
  end if;
  select s.name into sname from public.societies s where s.id = sid;
  if sname is null then
    raise exception 'Society not found';
  end if;
  -- Nobody can be made a manager by someone they've blocked, or who has
  -- blocked them. Same wording as a refused friend request.
  if public.is_blocked_between(auth.uid(), person) then
    raise exception 'You can''t add this person';
  end if;
  if person is null or not exists (select 1 from public.profiles p where p.id = person) then
    raise exception 'That person isn''t on Function';
  end if;
  insert into public.society_admins (society_id, user_id) values (sid, person)
  on conflict do nothing;
  -- Only someone newly added is told (and never the person adding themselves).
  -- The push opens the society's Hub.
  if found and person is distinct from auth.uid() then
    perform public.queue_push(person, 'hub', 'You''re now a manager of ' || sname, 'Open the Society Hub to see it.',
                              '/hub/' || sid, 'manager-added:' || sid || ':' || person);
  end if;
end;
$$;
revoke execute on function public.add_society_manager(uuid, uuid) from public, anon;
grant execute on function public.add_society_manager(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. A feature request goes live
-- ---------------------------------------------------------------------

-- As in 20261120000000_feature_requests_founding.sql, but the push opens
-- the Hub's Requests page. The trigger that calls it
-- (feature_requests_push_live) is unchanged.
create or replace function public.push_on_request_live()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  manager uuid;
begin
  for manager in select a.user_id from public.society_admins a where a.society_id = new.society_id loop
    perform public.queue_push(manager, 'hub', 'Your feature request is live', left(new.need, 100),
                              '/hub/' || new.society_id || '/requests', 'request-live:' || new.id || ':' || manager);
  end loop;
  return null;
end;
$$;
revoke execute on function public.push_on_request_live() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. The daily Hub reminders (run by supabase/RUN_ONCE_hub_cron.sql)
-- ---------------------------------------------------------------------

-- As in 20261122000000_event_admin_documents.sql, but the weekly Founding
-- nudge opens the society's Hub. The event admin checklist reminders still
-- open the event's manage screen. Server-only, as before.
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
  today date := (now() at time zone 'Europe/London')::date;
  due date;
  label text;
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
                                '/hub/' || r.id, k);
      if exists (select 1 from public.push_queue q where q.dedupe_key = k) then
        queued := queued + 1;
      end if;
    end loop;
  end loop;

  -- Event admin: the checklist items due in the next 3 days (today, and
  -- the 2 days after) that aren't ticked yet. The text comparison narrows
  -- the rows down cheaply; each date is then checked properly below.
  for r in
    select e.id as event_id, e.society_id, e.title, d.key as item, d.value as due_text
    from public.event_admin a
    join public.events e on e.id = a.event_id
    cross join lateral jsonb_each_text(a.deadlines) d
    where e.starts_at > now()
      and not e.is_cancelled
      and not e.is_hidden
      and e.society_id is not null
      and public.society_feature_on(e.society_id, 'event_admin')
      and d.key in ('form_submitted', 'su_approved', 'room_confirmed', 'academic_chair', 'native_tickets', 'security_list')
      and d.value ~ '^\d{4}-\d{2}-\d{2}$'
      and d.value collate "C" between to_char(today, 'YYYY-MM-DD') and to_char(today + 2, 'YYYY-MM-DD')
      and (a.checklist -> d.key ->> 'done_at') is null
      and not (d.key = 'su_approved' and a.su_approved_at is not null)
    order by e.starts_at, e.id, d.key
  loop
    begin
      due := r.due_text::date;
    exception when others then
      continue;
    end;
    continue when today < due - 2 or today > due;
    label := case r.item
      when 'form_submitted' then 'Form submitted on Podio'
      when 'su_approved' then 'SU approved'
      when 'room_confirmed' then 'Room confirmed'
      when 'academic_chair' then 'Academic chair secured'
      when 'native_tickets' then 'Native tickets set up'
      when 'security_list' then 'Security guest list sent'
    end;
    for manager in select a.user_id from public.society_admins a where a.society_id = r.society_id loop
      k := 'ea:' || r.event_id || ':' || r.item || ':' || manager || ':' || to_char(today, 'YYYY-MM-DD');
      continue when exists (select 1 from public.push_queue q where q.dedupe_key = k);
      perform public.queue_push(manager, 'hub',
                                label || ' due ' || to_char(due, 'Dy FMDD Mon'),
                                r.title || ': tick it off in the Society Hub once it''s done.',
                                '/dashboard/' || r.society_id || '/events/' || r.event_id, k);
      if exists (select 1 from public.push_queue q where q.dedupe_key = k) then
        queued := queued + 1;
      end if;
    end loop;
  end loop;
  return queued;
end;
$$;
revoke execute on function public.queue_hub_reminders() from public, anon, authenticated;
