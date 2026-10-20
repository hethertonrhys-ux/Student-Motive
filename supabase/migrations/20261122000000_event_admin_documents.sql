-- Event admin, part 2 (Part 5b of the Society Hub): somewhere private for
-- the SU paperwork drafts, ticking off the checklist, and reminders before
-- each checklist deadline. Function prepares drafts; the committee checks
-- and submits them.
--
-- Adds:
--   - A private storage bucket 'society-documents' for the drafts Function
--     prepares (risk assessment, budget), under '<society id>/<event id>/'.
--     Only that society's managers (and Function admins) can read a file;
--     nobody using the app can add, change or delete one: files are written
--     only by the server (supabase/functions/event-documents, which uses the
--     service role). Until LSESU's templates are added to
--     docs/lsesu-templates/ nothing is written there.
--   - set_event_checklist_item(event, item, done): a manager ticks (or
--     unticks) a checklist item. The server records when and who, in
--     event_admin.checklist as { "<item>": { "done_at": ..., "done_by": ... } }.
--     That's the only way to change the checklist from the app
--     (event_admin_checklist_guard).
--     "SU approved" isn't ticked here: it's event_admin.su_approved_at
--     (20261121000000_event_admin.sql), which the approval gate reads.
--   - queue_hub_reminders(): as in 20261120000000_feature_requests_founding.sql,
--     plus a Society Hub push to each manager in the 3 days up to each
--     checklist deadline that isn't ticked yet (at most one a day per item).
--   - event_hosts(): a draft's hosts only for the people who can see it.
--
-- Only adds things (nothing is dropped, renamed or deleted) and is safe to
-- run more than once. No society on Function today has Event admin on, so
-- none of them sees a change (no event_admin rows, so no new reminders).

-- ---------------------------------------------------------------------
-- 1. The private documents bucket
-- ---------------------------------------------------------------------

-- 10 MB; Word (.docx), Excel (.xlsx) and PDF only. Private: files are
-- reached through short-lived signed links, never a public URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('society-documents', 'society-documents', false, 10485760, array[
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf'
])
on conflict (id) do nothing;

-- Reading a file: a manager of the society whose id is the file's first
-- folder, or a Function admin. The folder is compared as text (never cast
-- to a uuid), so an odd file name simply matches nobody.
drop policy if exists society_documents_select on storage.objects;
create policy society_documents_select on storage.objects for select to authenticated
  using (
    bucket_id = 'society-documents'
    and (
      exists (
        select 1 from public.society_admins a
        where a.user_id = (select auth.uid())
          and a.society_id::text = (storage.foldername(name))[1]
      )
      or public.is_motive_admin()
    )
  );
-- No insert, update or delete policies for this bucket: only the server
-- (the service role, which bypasses these rules) writes files there.

-- ---------------------------------------------------------------------
-- 2. Ticking off the checklist
-- ---------------------------------------------------------------------

-- A manager of the event's society (or a Function admin) ticks or unticks
-- one checklist item. Ticking an item that's already ticked keeps who
-- ticked it first, and when. Returns the event's checklist.
create or replace function public.set_event_checklist_item(eid uuid, item text, done boolean)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  sid uuid;
  result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Log in first';
  end if;
  if item is null or item not in ('form_submitted', 'room_confirmed', 'academic_chair', 'native_tickets', 'security_list') then
    raise exception 'That isn''t a checklist item';
  end if;
  sid := public.event_society(eid);
  if sid is null or not public.is_society_admin(sid) then
    raise exception 'Only the society''s committee can do this';
  end if;
  -- Lets this change through event_admin_checklist_guard (below), for
  -- this transaction only.
  perform set_config('function.checklist', 'on', true);
  update public.event_admin a
     set checklist = case
           when not coalesce(done, false) then a.checklist - item
           when a.checklist -> item ->> 'done_at' is not null then a.checklist
           else a.checklist || jsonb_build_object(item, jsonb_build_object('done_at', now(), 'done_by', (select auth.uid())))
         end
   where a.event_id = eid
  returning a.checklist into result;
  if not found then
    raise exception 'Add the event admin answers first';
  end if;
  -- Only after the check above: perform sets FOUND too.
  perform set_config('function.checklist', '', true);
  return result;
end;
$$;
revoke execute on function public.set_event_checklist_item(uuid, text, boolean) from public, anon;
grant execute on function public.set_event_checklist_item(uuid, text, boolean) to authenticated;

-- Ticks only go through set_event_checklist_item, so "when and who" are
-- always the server's: a manager writing event_admin directly (the
-- policies in 20261121000000_event_admin.sql allow that, for the answers)
-- can't change the checklist. A direct change keeps it as it was, and a
-- new row starts with nothing ticked. The database's own scripts (no
-- logged-in user) are left alone. A separate trigger, so event_admin_stamp
-- stays as it is.
create or replace function public.event_admin_checklist_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or current_setting('function.checklist', true) = 'on' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.checklist := old.checklist;
  else
    new.checklist := '{}'::jsonb;
  end if;
  return new;
end;
$$;
revoke execute on function public.event_admin_checklist_guard() from public, anon, authenticated;
drop trigger if exists event_admin_checklist_guard on public.event_admin;
create trigger event_admin_checklist_guard before insert or update on public.event_admin
  for each row execute function public.event_admin_checklist_guard();

-- ---------------------------------------------------------------------
-- 3. Reminders (run daily by supabase/RUN_ONCE_hub_cron.sql)
-- ---------------------------------------------------------------------

-- Copied from 20261120000000_feature_requests_founding.sql (the weekly
-- Founding nudge, unchanged), with the event admin reminders added after it.
--
-- Event admin reminders: for each upcoming event (drafts included: the
-- paperwork matters most then) that isn't cancelled or hidden, of a
-- society that still has Event admin on, each checklist item the event
-- needs (it has a deadline in event_admin.deadlines, saved from the app's
-- rules) and nobody has ticked yet: from 2 days before its deadline up to
-- the deadline itself (London dates), each of the society's managers gets
-- a Society Hub push, at most one a day per item. "SU approved" counts as
-- ticked once su_approved_at is set. A deadline that isn't a real date is
-- skipped. The push opens the event's manage screen, which every app build
-- has. Returns how many pushes were queued. Server-only.
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
                                '/dashboard/' || r.id, k);
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

-- ---------------------------------------------------------------------
-- 4. A draft's hosts
-- ---------------------------------------------------------------------

-- Who counts as the host of an event (20261114000000_society_event_chats.sql),
-- as before, but nothing at all for a draft unless you're the society's
-- committee, the student hosting it, or a Function admin (a member who
-- can't see the draft learns nothing about it).
create or replace function public.event_hosts(eid uuid)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select e.host_user_id from public.events e
  where e.id = eid and e.host_user_id is not null
    and ((select auth.uid()) is not null)
    and (not e.is_draft
         or e.host_user_id = (select auth.uid())
         or (e.society_id is not null and public.is_society_admin(e.society_id))
         or public.is_motive_admin())
    and (public.is_event_host(eid) or public.is_going_to(eid)
         or (not e.is_hidden
             and not public.is_blocked_between(e.host_user_id, (select auth.uid()))
             and (e.visibility = 'public' or public.are_friends(e.host_user_id, (select auth.uid())))))
  union
  select a.user_id from public.society_admins a
  join public.events e on e.society_id = a.society_id
  where e.id = eid
    and ((select auth.uid()) is not null)
    and (not e.is_draft
         or e.host_user_id = (select auth.uid())
         or public.is_society_admin(e.society_id)
         or public.is_motive_admin())
    and (public.is_going_to(eid) or public.is_society_admin(e.society_id) or public.is_society_member(e.society_id));
$$;
revoke execute on function public.event_hosts(uuid) from public, anon;
grant execute on function public.event_hosts(uuid) to authenticated;
