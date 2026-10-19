-- =====================================================================
-- Push notifications.
--
-- Only ADDS things: three new tables, a few trigger functions and triggers
-- that write to an outbox table ("push_queue") when something happens.
-- Nothing existing is changed; nothing is deleted. The actual sending is
-- done by the send-push edge function (supabase/functions/send-push),
-- which reads the queue. See supabase/RUN_ONCE_push_cron.sql for the
-- timers that call it.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

-- 1. Where to send: one row per phone or browser a person has allowed.
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  token text not null unique,            -- Expo push token, or the web push endpoint
  subscription jsonb,                    -- web only: the full PushSubscription (endpoint + keys)
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
drop policy if exists push_tokens_own on public.push_tokens;
create policy push_tokens_own on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 2. What each person wants to hear about. No row means everything on.
create table if not exists public.notification_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  messages boolean not null default true,        -- someone messages you
  friends boolean not null default true,         -- friend requests and acceptances
  society_events boolean not null default true,  -- a society you're in posts an event
  reminders boolean not null default true,       -- an event you've joined is starting soon
  hosting boolean not null default true,         -- someone joins or asks to join your event
  updated_at timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
drop policy if exists notification_settings_own on public.notification_settings;
create policy notification_settings_own on public.notification_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 3. The outbox. Only the server (service role) reads it.
create table if not exists public.push_queue (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('messages', 'friends', 'society_events', 'reminders', 'hosting')),
  title text not null,
  body text not null,
  url text,                              -- where tapping it opens, e.g. /chats/<id>
  dedupe_key text unique,                -- stops the same reminder going twice
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);
create index if not exists push_queue_unsent_idx on public.push_queue (created_at) where sent_at is null;
alter table public.push_queue enable row level security;
-- (no policies: clients can't read or write it; the edge function uses the service role)

-- 4. Queue one notification for one person, if they haven't turned that kind off.
create or replace function public.queue_push(target uuid, kind text, title text, body text, url text default null, dedupe text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  wanted boolean;
begin
  if target is null then return; end if;
  select case kind
           when 'messages' then s.messages
           when 'friends' then s.friends
           when 'society_events' then s.society_events
           when 'reminders' then s.reminders
           when 'hosting' then s.hosting
         end
    into wanted
    from public.notification_settings s where s.user_id = target;
  if coalesce(wanted, true) is false then return; end if;
  -- Only people who have allowed notifications somewhere get rows at all.
  if not exists (select 1 from public.push_tokens t where t.user_id = target) then return; end if;
  insert into public.push_queue (user_id, kind, title, body, url, dedupe_key)
  values (target, kind, left(title, 120), left(body, 200), url, dedupe)
  on conflict (dedupe_key) do nothing;
end;
$$;
revoke all on function public.queue_push(uuid, text, text, text, text, text) from public;

-- The name other students see for someone.
create or replace function public.push_name(person uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(nullif(p.display_name, ''), 'Someone') from public.profiles p where p.id = person;
$$;

-- 5a. Someone messages you (private chat: the other person; event chat: everyone going).
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
drop trigger if exists messages_push on public.messages;
create trigger messages_push after insert on public.messages for each row execute function public.push_on_message();

-- 5b. Friend requests, and when one is accepted.
create or replace function public.push_on_friendship()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.queue_push(new.addressee_id, 'friends', 'New friend request', public.push_name(new.requester_id) || ' wants to be friends.', '/friends');
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform public.queue_push(new.requester_id, 'friends', 'Friend request accepted', public.push_name(new.addressee_id) || ' accepted your friend request.', '/u/' || new.addressee_id);
  end if;
  return new;
end;
$$;
drop trigger if exists friendships_push on public.friendships;
create trigger friendships_push after insert or update on public.friendships for each row execute function public.push_on_friendship();

-- 5c. A society you're a member of posts a new event.
create or replace function public.push_on_society_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  soc text;
  r uuid;
begin
  if new.society_id is null or new.is_hidden or new.is_cancelled then return new; end if;
  select name into soc from public.societies where id = new.society_id;
  for r in select m.user_id from public.society_members m where m.society_id = new.society_id and m.status = 'approved' and m.user_id is distinct from new.created_by loop
    perform public.queue_push(r, 'society_events', coalesce(soc, 'Your society') || ' posted an event', new.title, '/e/' || new.id, 'society-event:' || new.id || ':' || r);
  end loop;
  return new;
end;
$$;
drop trigger if exists events_push on public.events;
create trigger events_push after insert on public.events for each row execute function public.push_on_society_event();

-- 5d. Someone joins, or asks to join, an event you're hosting.
create or replace function public.push_on_social_member()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ev record;
begin
  select id, host_id, title into ev from public.social_events where id = new.event_id;
  if ev is null or ev.host_id = new.user_id then return new; end if;
  if tg_op = 'INSERT' and new.status = 'going' then
    perform public.queue_push(ev.host_id, 'hosting', public.push_name(new.user_id) || ' is going', ev.title, '/social/' || ev.id);
  elsif tg_op = 'INSERT' and new.status = 'pending' then
    perform public.queue_push(ev.host_id, 'hosting', public.push_name(new.user_id) || ' asked to join', ev.title, '/social/' || ev.id);
  end if;
  return new;
end;
$$;
drop trigger if exists social_members_push on public.social_event_members;
create trigger social_members_push after insert on public.social_event_members for each row execute function public.push_on_social_member();

-- Someone joins a society event you're hosting (student-hosted society-less events).
create or replace function public.push_on_event_entry()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ev record;
begin
  select id, host_user_id, title into ev from public.events where id = new.event_id;
  if ev is null or ev.host_user_id is null or ev.host_user_id = new.user_id then return new; end if;
  if tg_op = 'INSERT' and new.status in ('going', 'requested') then
    perform public.queue_push(ev.host_user_id, 'hosting', public.push_name(new.user_id) || case when new.status = 'going' then ' is going' else ' asked to join' end, ev.title, '/e/' || ev.id);
  end if;
  return new;
end;
$$;
drop trigger if exists event_entries_push on public.event_entries;
create trigger event_entries_push after insert on public.event_entries for each row execute function public.push_on_event_entry();

-- 6. "Starting soon": run every 5 minutes (see RUN_ONCE_push_cron.sql).
--    Finds events starting in 30 to 35 minutes and queues one reminder per
--    person going. The dedupe key stops repeats.
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
    where not e.is_cancelled and not e.is_hidden and e.starts_at between now() + interval '30 minutes' and now() + interval '35 minutes'
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
