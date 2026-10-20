-- Event admin (Part 5 of the Society Hub): draft events, the committee's
-- answers about each event (which decide the SU paperwork Function
-- prepares for them to check and submit), and the LSE approval gate.
--
-- Adds:
--   - events.is_draft: a draft is visible only to the society's managers
--     (and Function admins), or to the student hosting it. Every database
--     function that lists, counts, notifies about or lets people join
--     events leaves drafts out. Publishing a draft sends the "new event"
--     push then (once: the same dedupe keys as when an event is posted).
--   - events.published_at: when an event was first published, set by the
--     server. Founding progress and Notifications date an event by it, so a
--     draft published weeks later counts from when it went live.
--   - event_admin: one row per event with the committee's answers, the
--     form, the submit-by date, the checklist and "SU approved". Only that
--     society's managers (and Function admins) can see or change it.
--   - The approval gate: for an LSE society with Event admin on, an event
--     goes live only once a manager has ticked "SU approved". So for those
--     societies a new event starts as a draft. Events already published are
--     never affected, and switching the feature on later unpublishes nothing.
--
-- Only adds things (nothing is dropped, renamed or deleted) and is safe to
-- run more than once. Every existing event stays published (is_draft
-- defaults to false), and every society already on Function has Event
-- admin off (20261117000000_society_features.sql), so none of them sees a
-- change. Functions below are copied from their latest versions with only
-- the draft condition added; create or replace keeps their grants.

-- ---------------------------------------------------------------------
-- 1. Draft events
-- ---------------------------------------------------------------------

alter table public.events add column if not exists is_draft boolean not null default false;

-- Who can see an event: as in 20261104000000_london_unis.sql, and a draft
-- only by the society's managers (and Function admins) or its host.
alter policy events_select_visible on public.events
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
    and (
      society_id is null
      or public.can_see_society_event(society_id, audience)
      or public.has_entry(id)
    )
    and (not is_draft
      or (society_id is not null and public.is_society_admin(society_id))
      or host_user_id = (select auth.uid()))
  );

-- When an event was first published. Every event already published was
-- published when it was created. The backfill leaves updated_at alone, so
-- existing events don't change at all.
alter table public.events add column if not exists published_at timestamptz;
alter table public.events disable trigger events_set_updated_at;
update public.events set published_at = created_at where published_at is null and not is_draft;
alter table public.events enable trigger events_set_updated_at;

-- Set by the server only, whatever the app sends: null while an event has
-- never been published; when it's published, now (or, for one published
-- straight away, when it was created); after that it never moves, even if
-- it's unpublished and published again, so it can't be gamed. For an event
-- published straight away it stays equal to created_at, which only Function
-- admins and the database's own scripts can change (protect_event_fields). Before
-- triggers run in name order, so this one ("events_track_published") runs
-- after events_protect_fields has fixed created_at and after the approval
-- gate (events_su_approval_gate) has had its say.
create or replace function public.events_stamp_published()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.is_draft then
    new.published_at := case when tg_op = 'UPDATE' then old.published_at else null end;
  elsif tg_op = 'INSERT' then
    new.published_at := new.created_at;
  elsif old.published_at is null then
    new.published_at := now();
  elsif old.published_at = old.created_at then
    new.published_at := new.created_at;
  else
    new.published_at := old.published_at;
  end if;
  return new;
end;
$$;
revoke execute on function public.events_stamp_published() from public, anon, authenticated;
drop trigger if exists events_track_published on public.events;
create trigger events_track_published before insert or update on public.events
  for each row execute function public.events_stamp_published();

-- Whether an event is a draft, for the policy below (security definer, so
-- it answers even for people who can't see the draft).
create or replace function public.event_is_draft(eid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select e.is_draft from public.events e where e.id = eid), false) $$;
revoke execute on function public.event_is_draft(uuid) from public, anon;
grant execute on function public.event_is_draft(uuid) to authenticated;

-- Who's on an event (20261017000000_members_formats_ledger.sql): as
-- before, but a draft's list only for the society's managers (and Function
-- admins). People added to a draft still see their own entry.
alter policy event_entries_select on public.event_entries
  using (
    user_id = (select auth.uid())
    or (public.is_society_member(public.event_society(event_id))
        and (not public.event_is_draft(event_id) or public.is_society_admin(public.event_society(event_id))))
  );

-- ---------------------------------------------------------------------
-- 2. Functions that list, count, notify about or join events skip drafts
-- ---------------------------------------------------------------------

-- Joining (20261020000000_social.sql): a draft can't be joined.
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
  if ev.is_draft then raise exception 'This event isn''t published yet'; end if;
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

-- "Starting soon" reminders (20261109000000_push_notifications.sql): none
-- for drafts. Still server-only (20261116000000_security_fixes.sql).
create or replace function public.queue_event_reminders()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer := 0;
  r record;
  when_text text;
begin
  for r in
    select e.id, e.title, e.starts_at, en.user_id, '/e/' || e.id as url
    from public.events e join public.event_entries en on en.event_id = e.id and en.status = 'going'
    where not e.is_cancelled and not e.is_hidden and not e.is_draft and e.starts_at between now() + interval '30 minutes' and now() + interval '35 minutes'
    union all
    select se.id, se.title, se.starts_at, m.user_id, '/social/' || se.id
    from public.social_events se join public.social_event_members m on m.event_id = se.id and m.status = 'going'
    where not se.is_cancelled and not se.is_hidden and se.starts_at between now() + interval '30 minutes' and now() + interval '35 minutes'
    union all
    select se.id, se.title, se.starts_at, se.host_id, '/social/' || se.id
    from public.social_events se
    where not se.is_cancelled and not se.is_hidden and se.starts_at between now() + interval '30 minutes' and now() + interval '35 minutes'
  loop
    when_text := to_char(r.starts_at at time zone 'Europe/London', 'HH24:MI');
    perform public.queue_push(r.user_id, 'reminders', 'Starting soon: ' || r.title, 'Starts at ' || when_text || '.', r.url, 'reminder:' || r.id || ':' || r.user_id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.queue_event_reminders() from public;
revoke execute on function public.queue_event_reminders() from public, anon, authenticated;

-- Friends hosting or going (20261110000000_recommendations.sql): no counts for drafts.
create or replace function public.my_friend_event_signals(society_ids uuid[] default '{}', social_ids uuid[] default '{}')
returns table (kind text, event_id uuid, hosting boolean, going integer)
language sql stable security definer set search_path = ''
as $$
  with friends as materialized (
    select case when f.requester_id = (select auth.uid()) then f.addressee_id else f.requester_id end as fid
    from public.friendships f
    where f.status = 'accepted' and (select auth.uid()) in (f.requester_id, f.addressee_id)
  ),
  -- The counts first (cheap), then the visibility rules only for events with a signal.
  soc as materialized (
    select e.id, e.society_id, e.audience, e.host_user_id, e.visibility,
           (e.host_user_id is not null and e.host_user_id in (select fid from friends)) as hosting,
           (select count(*)::integer from public.event_entries en
             where en.event_id = e.id and en.status = 'going' and en.user_id in (select fid from friends)) as going
    from public.events e
    where (select auth.uid()) is not null
      and e.id = any(coalesce(society_ids, '{}'))
      and not e.is_hidden and not e.is_cancelled and not e.is_draft
  ),
  sol as materialized (
    select se.id, se.host_id, se.friends_only,
           (se.host_id in (select fid from friends)) as hosting,
           (select count(*)::integer from public.social_event_members m
             where m.event_id = se.id and m.status = 'going' and m.user_id in (select fid from friends)) as going
    from public.social_events se
    where (select auth.uid()) is not null
      and se.id = any(coalesce(social_ids, '{}'))
      and not se.is_hidden and not se.is_cancelled
  )
  select 'society'::text, s.id, s.hosting, s.going
  from soc s
  where (s.hosting or s.going > 0)
    and (s.society_id is null or public.can_see_society_event(s.society_id, s.audience) or public.has_entry(s.id))
    and (s.host_user_id is null
         or (not public.is_blocked_between(s.host_user_id, (select auth.uid()))
             and (s.visibility = 'public' or public.are_friends(s.host_user_id, (select auth.uid())) or public.has_entry(s.id))))
  union all
  select 'social'::text, s.id, s.hosting, s.going
  from sol s
  where (s.hosting or s.going > 0)
    and not public.is_blocked_between(s.host_id, (select auth.uid()))
    and (not s.friends_only or public.are_friends(s.host_id, (select auth.uid())) or public.social_is_member(s.id));
$$;
revoke execute on function public.my_friend_event_signals(uuid[], uuid[]) from public, anon;
grant execute on function public.my_friend_event_signals(uuid[], uuid[]) to authenticated;

-- The chat list (20261114000000_society_event_chats.sql): a draft's chat
-- only shows for the society's committee (or the student hosting it).
create or replace function public.my_threads()
returns table (
  id uuid, event_id uuid, title text, other_id uuid, other_name text, other_avatar text,
  last_body text, last_at timestamptz, last_sender uuid, unread bigint, social_event_id uuid
)
language sql stable security definer set search_path = ''
as $$
  with mine as materialized (
    select t.id from public.threads t
    where t.user_a = (select auth.uid()) or t.user_b = (select auth.uid())
       or t.event_id in (
            select en.event_id from public.event_entries en where en.user_id = (select auth.uid()) and en.status = 'going'
            union select ev.id from public.events ev where ev.host_user_id = (select auth.uid())
            union select ev.id from public.events ev join public.society_admins a on a.society_id = ev.society_id where a.user_id = (select auth.uid()))
       or t.social_event_id in (
            select s.id from public.social_events s where s.host_id = (select auth.uid())
            union select m.event_id from public.social_event_members m where m.user_id = (select auth.uid()) and m.status = 'going')
  ), ok as materialized (
    select mine.id from mine where public.can_use_thread(mine.id)
  )
  select t.id, t.event_id,
         coalesce(e.title, se.title, coalesce(nullif(op.display_name, ''), 'Member')),
         op.id, coalesce(nullif(op.display_name, ''), 'Member'), op.avatar_url,
         lm.body, coalesce(lm.created_at, t.created_at), lm.sender_id,
         (select count(*) from public.messages m
          where m.thread_id = t.id and m.sender_id is distinct from (select auth.uid())
            and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)),
         t.social_event_id
  from public.threads t
  join ok on ok.id = t.id
  left join public.events e on e.id = t.event_id
  left join public.social_events se on se.id = t.social_event_id
  left join public.profiles op on op.id = case when t.user_a = (select auth.uid()) then t.user_b else t.user_a end
                               and t.event_id is null and t.social_event_id is null
  left join public.thread_reads r on r.thread_id = t.id and r.user_id = (select auth.uid())
  left join lateral (
    select body, created_at, sender_id from public.messages m
    where m.thread_id = t.id order by created_at desc limit 1
  ) lm on true
  where (e.id is null or e.ends_at > now() - interval '7 days')
    and (se.id is null or se.ends_at > now() - interval '7 days')
    and (e.id is null or not e.is_draft
         or (e.society_id is not null and public.is_society_committee(e.society_id))
         or e.host_user_id = (select auth.uid()))
  order by coalesce(lm.created_at, t.created_at) desc
  limit 100;
$$;

-- Who can use a chat (20261114000000_society_event_chats.sql): a draft's
-- chat exists (event_create_chat is unchanged), but only its committee (or
-- the student hosting it) can use it until it's published.
create or replace function public.can_use_thread(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.threads t
    where t.id = tid and (
      (t.event_id is null and t.social_event_id is null
        and (select auth.uid()) in (t.user_a, t.user_b)
        and (public.are_friends(t.user_a, t.user_b)
             or (t.via_social_event is not null and not public.is_blocked_between(t.user_a, t.user_b))))
      or (t.event_id is not null
        and (public.is_event_host(t.event_id)
             or (public.is_going_to(t.event_id)
                 and not exists (select 1 from public.events d where d.id = t.event_id and d.is_draft))
             or exists (select 1 from public.events e where e.id = t.event_id and e.society_id is not null and public.is_society_committee(e.society_id))))
      or (t.social_event_id is not null
        and (public.social_is_host(t.social_event_id) or public.social_is_going(t.social_event_id)))
    )
  );
$$;

-- Opening an event's chat (20261114000000_society_event_chats.sql): the
-- same people as above.
create or replace function public.open_event_chat(eid uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  tid uuid;
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  if not (public.is_event_host(eid)
          or (public.is_going_to(eid) and not exists (select 1 from public.events d where d.id = eid and d.is_draft))
          or exists (select 1 from public.events e where e.id = eid and e.society_id is not null and public.is_society_committee(e.society_id))) then
    raise exception 'Only people going can see the chat';
  end if;
  insert into public.threads (event_id) values (eid) on conflict (event_id) do nothing;
  select id into tid from public.threads where event_id = eid;
  return tid;
end;
$$;

-- Message pushes (20261114000000_society_event_chats.sql): in a draft's
-- chat, only the committee and the host hear about new messages.
create or replace function public.push_on_message()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  t record;
  who text := public.push_name(new.sender_id);
  preview text := left(coalesce(new.body, ''), 100);
  r uuid;
begin
  if new.sender_id is null then return new; end if;
  select * into t from public.threads where id = new.thread_id;
  if t is null then return new; end if;
  if t.event_id is null and t.social_event_id is null then
    perform public.queue_push(case when t.user_a = new.sender_id then t.user_b else t.user_a end, 'messages', who, preview, '/chats/' || t.id);
  elsif t.event_id is not null then
    for r in
      select distinct u from (
        select e.host_user_id as u from public.events e where e.id = t.event_id
        union select en.user_id from public.event_entries en where en.event_id = t.event_id and en.status = 'going'
          and not exists (select 1 from public.events d where d.id = t.event_id and d.is_draft)
        union select a.user_id from public.society_admins a join public.events e on e.society_id = a.society_id where e.id = t.event_id
      ) x where u is not null and u <> new.sender_id
    loop
      perform public.queue_push(r, 'messages', who || ' in ' || (select title from public.events where id = t.event_id), preview, '/chats/' || t.id);
    end loop;
  else
    for r in
      select distinct u from (
        select se.host_id as u from public.social_events se where se.id = t.social_event_id
        union select m.user_id from public.social_event_members m where m.event_id = t.social_event_id and m.status = 'going'
      ) x where u is not null and u <> new.sender_id
    loop
      perform public.queue_push(r, 'messages', who || ' in ' || (select title from public.social_events where id = t.social_event_id), preview, '/chats/' || t.id);
    end loop;
  end if;
  return new;
end;
$$;

-- The committee reshuffling a table (20261113000000_poker_seats.sql): no
-- push about a draft (someone the committee added to it isn't told about
-- it until it's published). The seat change is still recorded; the app
-- shows it as "your event" while the draft's title is hidden.
create or replace function public.randomise_table_seats(eid uuid, tid uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  players uuid[];
  olds integer[];
  moved integer := 0;
  tname text;
  ename text;
  draft boolean;
  i integer;
begin
  if not public.is_society_admin(public.event_society(eid)) then raise exception 'Only the committee can do this'; end if;
  perform 1 from public.events where id = eid for update;
  select t.name into tname from public.event_tables t where t.id = tid and t.event_id = eid;
  if tname is null then raise exception 'That table isn''t part of this event'; end if;
  select e.title, e.is_draft into ename, draft from public.events e where e.id = eid;
  -- A random order of the players at the table; position i becomes Seat i.
  select coalesce(array_agg(s.user_id order by s.rnd), '{}'), coalesce(array_agg(s.seat_no order by s.rnd), '{}')
    into players, olds
    from (select e.user_id, e.seat_no, random() as rnd from public.event_entries e where e.event_id = eid and e.table_id = tid and e.status = 'going') s;
  -- Two passes so no two players ever share a number mid-way.
  for i in 1 .. coalesce(array_length(players, 1), 0) loop
    perform set_config('function.seating', players[i]::text, true);
    update public.event_entries e set seat_no = null where e.event_id = eid and e.user_id = players[i];
  end loop;
  for i in 1 .. coalesce(array_length(players, 1), 0) loop
    perform set_config('function.seating', players[i]::text, true);
    update public.event_entries e set seat_no = i where e.event_id = eid and e.user_id = players[i];
    if i is distinct from olds[i] then
      moved := moved + 1;
      insert into public.seat_changes (event_id, user_id, table_id, seat_no, reason) values (eid, players[i], tid, i, 'randomised');
      if not draft then
        perform public.queue_push(players[i], 'seating', 'Seats reshuffled', 'You''re now in Seat ' || i || ' at ' || tname || ' for ' || ename, '/e/' || eid);
      end if;
    end if;
  end loop;
  perform set_config('function.seating', '', true);
  return moved;
end;
$$;

-- A society's published events, for Founding progress
-- (20261120000000_feature_requests_founding.sql): drafts don't count, and
-- each event is dated by when it was published (its "created_at" here), so
-- a draft published later counts from then. founding_status,
-- founding_badge_active, admin_founding_societies and queue_hub_reminders
-- use this, so they follow. Still server-only.
create or replace function public.society_published_events(sid uuid)
returns table (id uuid, created_at timestamptz, starts_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select e.id, coalesce(e.published_at, e.created_at) as created_at, e.starts_at
  from public.events e
  where e.society_id = sid
    and not e.is_cancelled
    and not e.is_hidden
    and not e.is_draft
$$;
revoke execute on function public.society_published_events(uuid) from public, anon, authenticated;

-- "<Society> posted an event" (20261109000000_push_notifications.sql): not
-- for a draft when it's created...
create or replace function public.push_on_society_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  soc text;
  r uuid;
begin
  if new.society_id is null or new.is_hidden or new.is_cancelled or new.is_draft then return new; end if;
  select name into soc from public.societies where id = new.society_id;
  for r in select m.user_id from public.society_members m where m.society_id = new.society_id and m.status = 'approved' and m.user_id is distinct from new.created_by loop
    perform public.queue_push(r, 'society_events', coalesce(soc, 'Your society') || ' posted an event', new.title, '/e/' || new.id, 'society-event:' || new.id || ':' || r);
  end loop;
  return new;
end;
$$;

-- ...but when it's published: the same push, with the same dedupe keys, so
-- nobody hears about one event twice (even if it's unpublished and
-- published again).
drop trigger if exists events_push_published on public.events;
create trigger events_push_published after update of is_draft on public.events
  for each row when (old.is_draft and not new.is_draft)
  execute function public.push_on_society_event();

-- ---------------------------------------------------------------------
-- 3. The committee's answers about each event
-- ---------------------------------------------------------------------

create table if not exists public.event_admin (
  event_id uuid primary key references public.events (id) on delete cascade,
  society_id uuid not null references public.societies (id) on delete cascade,
  expected_attendees integer check (expected_attendees between 0 and 100000),
  venue_type text not null default 'campus' check (venue_type in ('campus', 'london', 'away')),
  alcohol text not null default 'none' check (alcohol in ('none', 'available', 'focus')),
  external_speaker boolean not null default false,
  speaker_names text check (speaker_names is null or length(speaker_names) <= 500),
  speaker_org text check (speaker_org is null or length(speaker_org) <= 200),
  non_lse_guests boolean not null default false,
  open_to_public boolean not null default false,
  budget_pence integer check (budget_pence between 0 and 100000000),
  cost_lines jsonb not null default '[]'::jsonb check (jsonb_typeof(cost_lines) = 'array'),
  physical_activity boolean not null default false,
  food boolean not null default false,
  native_url text check (native_url is null or length(native_url) <= 500),
  form text check (form in ('regular', 'large', 'trip')),
  submit_by date,
  checklist jsonb not null default '{}'::jsonb check (jsonb_typeof(checklist) = 'object'),
  deadlines jsonb not null default '{}'::jsonb check (jsonb_typeof(deadlines) = 'object'),
  su_approved_at timestamptz,
  su_approved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
create index if not exists event_admin_society_idx on public.event_admin (society_id);
alter table public.event_admin enable row level security;

-- The society's managers (and Function admins) only. Nobody else sees it,
-- and there's no attendee data in it.
drop policy if exists event_admin_select on public.event_admin;
create policy event_admin_select on public.event_admin
  for select to authenticated using (public.is_society_admin(society_id));
drop policy if exists event_admin_insert on public.event_admin;
create policy event_admin_insert on public.event_admin
  for insert to authenticated with check (public.is_society_admin(society_id));
drop policy if exists event_admin_update on public.event_admin;
create policy event_admin_update on public.event_admin
  for update to authenticated
  using (public.is_society_admin(society_id)) with check (public.is_society_admin(society_id));
drop policy if exists event_admin_delete on public.event_admin;
create policy event_admin_delete on public.event_admin
  for delete to authenticated using (public.is_society_admin(society_id));

revoke all on table public.event_admin from public, anon, authenticated;
grant select, insert, update, delete on table public.event_admin to authenticated;

-- The society is always the event's (so the permission check above is
-- about the right society), and the event never changes. Who changed it
-- and when are the server's, and so is who ticked "SU approved": stamped
-- when it's ticked, kept while it stays ticked, cleared when it's unticked.
-- Changes the database makes itself further down a chain (an account being
-- deleted clears updated_by and su_approved_by) go through as they are.
create or replace function public.event_admin_stamp()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  sid uuid;
begin
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.event_id := old.event_id;
    new.created_at := old.created_at;
  else
    new.created_at := now();
  end if;
  sid := public.event_society(new.event_id);
  if sid is null then
    raise exception 'Event admin is only for society events';
  end if;
  new.society_id := sid;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  if new.su_approved_at is null then
    new.su_approved_by := null;
  elsif tg_op = 'UPDATE' and old.su_approved_at is not null then
    new.su_approved_at := old.su_approved_at;
    new.su_approved_by := old.su_approved_by;
  else
    new.su_approved_by := (select auth.uid());
  end if;
  return new;
end;
$$;
revoke execute on function public.event_admin_stamp() from public, anon, authenticated;
drop trigger if exists event_admin_stamp on public.event_admin;
create trigger event_admin_stamp before insert or update on public.event_admin
  for each row execute function public.event_admin_stamp();

-- ---------------------------------------------------------------------
-- 4. The approval gate (LSE societies with Event admin on)
-- ---------------------------------------------------------------------

-- An event of an LSE society with Event admin on can't be published (a new
-- event that isn't a draft, or a draft becoming published) until one of
-- its managers has ticked "SU approved" on its event admin. So for those
-- societies a new event is created as a draft first. Events that are
-- already published are never touched, Function admins can always publish,
-- and the database's own scripts (no logged-in user) are left alone.
create or replace function public.event_publish_gate()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.is_draft or new.society_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and not old.is_draft then
    return new;
  end if;
  if (select auth.uid()) is null or public.is_motive_admin() then
    return new;
  end if;
  if not exists (select 1 from public.societies s where s.id = new.society_id and s.university = 'LSE')
     or not public.society_feature_on(new.society_id, 'event_admin') then
    return new;
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.event_admin a where a.event_id = new.id and a.su_approved_at is not null) then
    return new;
  end if;
  raise exception 'Tick "SU approved" before publishing. LSESU must approve events before they''re promoted.';
end;
$$;
revoke execute on function public.event_publish_gate() from public, anon, authenticated;
drop trigger if exists events_su_approval_gate on public.events;
create trigger events_su_approval_gate before insert or update of is_draft on public.events
  for each row execute function public.event_publish_gate();
