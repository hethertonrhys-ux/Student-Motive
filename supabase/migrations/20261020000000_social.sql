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
