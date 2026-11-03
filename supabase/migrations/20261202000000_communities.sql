-- =====================================================================
-- Communities (Phase 1): the database foundation.
--
-- Run this AFTER 20261201000000_instant_push.sql. It only adds things and
-- is safe to run more than once (paste it into the SQL Editor and run it
-- again if anything goes wrong part way).
--
-- See docs/COMMUNITIES_PLAN.md for the agreed plan. In short:
--
--   1. Tables: communities, community_members (a role and a membership
--      each, plus a status: pending, active, declined, removed or left),
--      community_groups (one main group per community, plus sub-groups such
--      as "AbaFam"), community_group_members (who is in each sub-group),
--      thread_participants (who is in each community chat, kept up to date
--      by triggers, so a 1,000-person chat is quick) and thread_mutes (for
--      every kind of chat). Nobody using the app can write to these tables
--      directly: every change goes through the functions in section 5,
--      which check the caller's role in that community and lock the rows
--      they change. Function admins (is_motive_admin()) pass every check.
--   2. Chats: each community group has one chat (threads.community_group_id).
--      threads.kind says what a chat is ('direct', 'event', 'social' or
--      'community'). A sub-group's chat shows small notes when someone
--      joins, is added, leaves or is removed ('joined' and 'added' are new
--      message kinds; 'left' and 'removed' already exist). An archived
--      sub-group's chat is hidden: nobody can read or post in it (the
--      Function team still can read it).
--   3. Every existing chat function that works out a chat's kind from its
--      empty fields gets a community branch. Private, event and Social
--      chats behave exactly as before.
--   4. Live chat: a trigger on messages tells Supabase Realtime ("broadcast
--      from database") about each new or deleted message, sending only its
--      id to the private topic thread:<chat id>. Only people who can use
--      the chat can listen. The app then loads the message through the
--      normal rules.
--   5. Server functions for joining, approvals, roles, membership, removal,
--      sub-groups, the roster and requests, plus the Function team's
--      create-a-community and set-its-first-admins.
--   6. Notifications: a message in a community chat queues every
--      notification in one step (skipping the sender, muted, blocked and
--      banned people and anyone who turned chat notifications off). Mutes
--      now work in every chat. send-push can claim up to 1,000 at a time;
--      old sent notifications are tidied away by purge_push_queue().
--   7. Mutes: set_thread_mute (1 hour, 8 hours, 1 week, always, off).
--   8. A keyset index for paging through a chat's history (in 2a).
--   9. Community images (banner and picture) in the images bucket, under
--      communities/<community id>/.
--  10. UCL Abacus, with its main group and AbaFam, and no members yet.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

create table if not exists public.communities (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique
              check (char_length(slug) between 3 and 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (char_length(name) between 1 and 80),
  bio         text not null default '' check (char_length(bio) <= 1000),
  image_url   text check (image_url is null or char_length(image_url) <= 2000),
  banner_url  text check (banner_url is null or char_length(banner_url) <= 2000),
  society_id  uuid references public.societies (id) on delete set null,
  settings    jsonb not null default '{"role_colours": {"admin": {"light": "#8A5A00", "dark": "#F5C04A"}, "committee": {"light": "#7A1010", "dark": "#FF5A5A"}, "member": {"light": "#C4362E", "dark": "#FFB8B3"}, "non_member": {"light": "#6B6B73", "dark": "#9A9AA3"}}, "membership_label": "paying member", "marketplace_enabled": false}'::jsonb,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists communities_society_idx on public.communities (society_id);

create table if not exists public.community_members (
  community_id            uuid not null references public.communities (id) on delete cascade,
  user_id                 uuid not null references public.profiles (id) on delete cascade,
  nickname                text not null check (char_length(nickname) between 1 and 30 and nickname = btrim(nickname) and nickname !~ '[[:cntrl:]]'),
  role                    text not null default 'regular' check (role in ('admin', 'committee', 'regular')),
  membership              text not null default 'non_member' check (membership in ('member', 'non_member')),
  membership_claimed      boolean not null default false,
  status                  text not null default 'pending' check (status in ('pending', 'active', 'declined', 'removed', 'left')),
  requested_at            timestamptz not null default now(),
  decided_by              uuid references public.profiles (id) on delete set null,
  decided_at              timestamptz,
  membership_confirmed_by uuid references public.profiles (id) on delete set null,
  membership_confirmed_at timestamptz,
  referred_by             uuid references public.profiles (id) on delete set null,
  updated_at              timestamptz not null default now(),
  primary key (community_id, user_id)
);
-- Nicknames are unique within a community, ignoring case, among people
-- waiting or in it (someone who left frees their nickname).
create unique index if not exists community_members_nickname_idx
  on public.community_members (community_id, lower(nickname)) where status in ('pending', 'active');
create index if not exists community_members_user_idx on public.community_members (user_id);
create index if not exists community_members_status_idx on public.community_members (community_id, status);

create table if not exists public.community_groups (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  description  text not null default '' check (char_length(description) <= 500),
  kind         text not null default 'sub' check (kind in ('main', 'sub')),
  image_url    text check (image_url is null or char_length(image_url) <= 2000),
  sort         integer not null default 0,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz
);
create unique index if not exists community_groups_one_main on public.community_groups (community_id) where kind = 'main';
create index if not exists community_groups_community_idx on public.community_groups (community_id);

-- Who is in each sub-group (everyone active is in the main group).
create table if not exists public.community_group_members (
  group_id uuid not null references public.community_groups (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists community_group_members_user_idx on public.community_group_members (user_id);

-- Who is in each community chat (kept up to date by the triggers in 2b).
create table if not exists public.thread_participants (
  thread_id uuid not null references public.threads (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
create index if not exists thread_participants_user_idx on public.thread_participants (user_id);

-- Muted chats (any kind of chat). muted_until null: muted until switched off.
create table if not exists public.thread_mutes (
  thread_id   uuid not null references public.threads (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  muted_until timestamptz,
  created_at  timestamptz not null default now(),
  primary key (thread_id, user_id)
);

drop trigger if exists communities_set_updated_at on public.communities;
create trigger communities_set_updated_at before update on public.communities
  for each row execute function public.set_updated_at();
drop trigger if exists community_members_set_updated_at on public.community_members;
create trigger community_members_set_updated_at before update on public.community_members
  for each row execute function public.set_updated_at();

-- Nobody writes to these tables from the app (Supabase grants everything
-- to anon and authenticated by default, so take it all back), and
-- logged-out visitors can't read them either.
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.community_groups enable row level security;
alter table public.community_group_members enable row level security;
alter table public.thread_participants enable row level security;
alter table public.thread_mutes enable row level security;
revoke all on public.communities, public.community_members, public.community_groups,
  public.community_group_members, public.thread_participants, public.thread_mutes from public, anon, authenticated;
grant select on public.communities, public.community_members, public.community_groups,
  public.community_group_members, public.thread_participants, public.thread_mutes to authenticated;

-- ---------------------------------------------------------------------
-- 2. Chats for community groups
-- ---------------------------------------------------------------------

-- 2a. Each group has one chat, and every chat says what it is.
alter table public.threads add column if not exists community_group_id uuid unique
  references public.community_groups (id) on delete cascade;
alter table public.threads add column if not exists kind text generated always as (
  case when community_group_id is not null then 'community'
       when event_id is not null then 'event'
       when social_event_id is not null then 'social'
       else 'direct' end) stored;

-- The shapes a chat can have (20261027000000_social_event_chats.sql), plus
-- a community chat: only its group set. The other three are unchanged.
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.threads'::regclass and conname = 'threads_kind_check'
                   and pg_get_constraintdef(oid) like '%community_group_id%') then
    alter table public.threads drop constraint if exists threads_kind_check;
    alter table public.threads add constraint threads_kind_check check (
      (community_group_id is null and event_id is not null and social_event_id is null and user_a is null and user_b is null)
      or (community_group_id is null and social_event_id is not null and event_id is null and user_a is null and user_b is null)
      or (community_group_id is null and event_id is null and social_event_id is null and user_a is not null and user_b is not null and user_a < user_b)
      or (community_group_id is not null and event_id is null and social_event_id is null and user_a is null and user_b is null and via_social_event is null)
    );
  end if;
end $$;

-- The notes a sub-group's chat shows: "Sam joined the group", "Sam added Bea".
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.messages'::regclass and conname = 'messages_kind_check'
                   and pg_get_constraintdef(oid) like '%''joined''%') then
    alter table public.messages drop constraint if exists messages_kind_check;
    alter table public.messages add constraint messages_kind_check
      check (kind in ('message', 'left', 'rejoined', 'event', 'photo', 'video', 'removed', 'joined', 'added'));
  end if;
end $$;

-- 8. Paging through a chat's history (pages of 50, newest first, by created_at then id).
create index if not exists messages_thread_keyset_idx on public.messages (thread_id, created_at desc, id desc);

-- 2b. Keeping thread_participants up to date.

-- A new community gets its main group straight away...
create or replace function public.community_create_main_group()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.community_groups (community_id, name, kind, sort, created_by)
  values (new.id, new.name, 'main', 0, new.created_by)
  on conflict do nothing;
  return null;
end;
$$;
drop trigger if exists communities_create_main_group on public.communities;
create trigger communities_create_main_group after insert on public.communities
  for each row execute function public.community_create_main_group();

-- ...and every group gets its chat (the main group's chat has everyone active in it).
create or replace function public.community_group_create_chat()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  tid uuid;
begin
  insert into public.threads (community_group_id) values (new.id) on conflict (community_group_id) do nothing;
  select t.id into tid from public.threads t where t.community_group_id = new.id;
  if new.kind = 'main' then
    insert into public.thread_participants (thread_id, user_id)
    select tid, m.user_id from public.community_members m where m.community_id = new.community_id and m.status = 'active'
    on conflict do nothing;
  end if;
  return null;
end;
$$;
drop trigger if exists community_groups_create_chat on public.community_groups;
create trigger community_groups_create_chat after insert on public.community_groups
  for each row execute function public.community_group_create_chat();

-- Becoming active puts you in the main chat (with nothing unread); leaving
-- 'active' (removed, left) takes you out of every chat and sub-group of
-- that community.
create or replace function public.community_member_sync()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  was_active boolean := false;
  now_active boolean := false;
  cid uuid;
  person uuid;
begin
  if tg_op = 'DELETE' then
    was_active := old.status = 'active';
    cid := old.community_id;
    person := old.user_id;
  else
    now_active := new.status = 'active';
    cid := new.community_id;
    person := new.user_id;
    if tg_op = 'UPDATE' then was_active := old.status = 'active'; end if;
  end if;

  if now_active and not was_active then
    insert into public.thread_participants (thread_id, user_id)
    select t.id, person from public.community_groups g join public.threads t on t.community_group_id = g.id
    where g.community_id = cid
      and (g.kind = 'main' or exists (select 1 from public.community_group_members gm where gm.group_id = g.id and gm.user_id = person))
    on conflict do nothing;
    -- Start with nothing unread rather than the whole history.
    insert into public.thread_reads (thread_id, user_id, last_read_at)
    select t.id, person, now() from public.community_groups g join public.threads t on t.community_group_id = g.id
    where g.community_id = cid and g.kind = 'main'
    on conflict (thread_id, user_id) do update set last_read_at = now();
  elsif was_active and not now_active then
    delete from public.community_group_members gm using public.community_groups g
    where g.id = gm.group_id and g.community_id = cid and gm.user_id = person;
    delete from public.thread_participants p using public.threads t, public.community_groups g
    where t.id = p.thread_id and g.id = t.community_group_id and g.community_id = cid and p.user_id = person;
  end if;
  return null;
end;
$$;
drop trigger if exists community_members_sync on public.community_members;
create trigger community_members_sync after insert or update of status or delete on public.community_members
  for each row execute function public.community_member_sync();

-- Joining a sub-group (while active in its community) puts you in its chat;
-- leaving it takes you out.
create or replace function public.community_group_member_sync()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.thread_participants (thread_id, user_id)
    select t.id, new.user_id from public.threads t
    join public.community_groups g on g.id = t.community_group_id
    join public.community_members m on m.community_id = g.community_id and m.user_id = new.user_id and m.status = 'active'
    where t.community_group_id = new.group_id
    on conflict do nothing;
    insert into public.thread_reads (thread_id, user_id, last_read_at)
    select t.id, new.user_id, now() from public.threads t where t.community_group_id = new.group_id
    on conflict (thread_id, user_id) do update set last_read_at = now();
  else
    delete from public.thread_participants p using public.threads t
    where t.id = p.thread_id and t.community_group_id = old.group_id and p.user_id = old.user_id;
  end if;
  return null;
end;
$$;
drop trigger if exists community_group_members_sync on public.community_group_members;
create trigger community_group_members_sync after insert or delete on public.community_group_members
  for each row execute function public.community_group_member_sync();

revoke execute on function public.community_create_main_group() from public, anon, authenticated;
revoke execute on function public.community_group_create_chat() from public, anon, authenticated;
revoke execute on function public.community_member_sync() from public, anon, authenticated;
revoke execute on function public.community_group_member_sync() from public, anon, authenticated;

-- 2c. Small helpers. The first three are used by the read rules below, so
--     logged-in people may call them (they only answer about the caller).

-- Is the logged-in person active in this community?
create or replace function public.is_community_member(cid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.community_members m
                 where m.community_id = cid and m.user_id = (select auth.uid()) and m.status = 'active');
$$;

-- Is the logged-in person one of this community's admins or committee?
create or replace function public.is_community_manager(cid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.community_members m
                 where m.community_id = cid and m.user_id = (select auth.uid()) and m.status = 'active'
                   and m.role in ('admin', 'committee'));
$$;

-- May the logged-in person see this group? The main group: everyone
-- active. A sub-group: its members, and the community's admins and
-- committee. The Function team: every group.
create or replace function public.can_see_community_group(gid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_motive_admin() or exists (
    select 1 from public.community_groups g
    where g.id = gid and (
      (g.kind = 'main' and public.is_community_member(g.community_id))
      or (g.kind = 'sub' and (public.is_community_manager(g.community_id)
          or (public.is_community_member(g.community_id)
              and exists (select 1 from public.community_group_members gm where gm.group_id = g.id and gm.user_id = (select auth.uid())))))
    )
  );
$$;

revoke execute on function public.is_community_member(uuid) from public, anon;
revoke execute on function public.is_community_manager(uuid) from public, anon;
revoke execute on function public.can_see_community_group(uuid) from public, anon;
grant execute on function public.is_community_member(uuid) to authenticated;
grant execute on function public.is_community_manager(uuid) to authenticated;
grant execute on function public.can_see_community_group(uuid) to authenticated;

-- The active role of a person in a community (null if they aren't active). Server only.
create or replace function public.community_role_of(cid uuid, person uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select m.role from public.community_members m
  where m.community_id = cid and m.user_id = person and m.status = 'active';
$$;
revoke execute on function public.community_role_of(uuid, uuid) from public, anon, authenticated;

-- The chat of a group. Server only.
create or replace function public.community_group_thread(gid uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select t.id from public.threads t where t.community_group_id = gid;
$$;
revoke execute on function public.community_group_thread(uuid) from public, anon, authenticated;

-- 2d. Read rules. Every write goes through the functions in section 5.
drop policy if exists communities_select on public.communities;
create policy communities_select on public.communities for select to authenticated using (true);

drop policy if exists community_members_select on public.community_members;
create policy community_members_select on public.community_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_community_manager(community_id) or public.is_motive_admin());

drop policy if exists community_groups_select on public.community_groups;
create policy community_groups_select on public.community_groups for select to authenticated
  using (public.can_see_community_group(id));

drop policy if exists community_group_members_select on public.community_group_members;
create policy community_group_members_select on public.community_group_members for select to authenticated
  using (public.can_see_community_group(group_id));

drop policy if exists thread_participants_select on public.thread_participants;
create policy thread_participants_select on public.thread_participants for select to authenticated
  using (user_id = (select auth.uid()) or public.is_motive_admin());

drop policy if exists thread_mutes_select on public.thread_mutes;
create policy thread_mutes_select on public.thread_mutes for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 3. The existing chat functions, each with a community branch. Each is
--    copied from its latest definition (named above it); private, event
--    and Social chats behave exactly as before.
-- ---------------------------------------------------------------------

-- 20261124000000_leave_group_chat.sql: who belongs in a chat. A community
-- chat: its participants, while the group isn't archived. (The private
-- chat branch now also says "not a community chat".)
create or replace function public.thread_member(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.threads t
    where t.id = tid and (
      (t.community_group_id is null and t.event_id is null and t.social_event_id is null
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
      or (t.community_group_id is not null
        and exists (select 1 from public.thread_participants p where p.thread_id = t.id and p.user_id = (select auth.uid()))
        and exists (select 1 from public.community_groups g where g.id = t.community_group_id and g.archived_at is null))
    )
  );
$$;
-- (can_use_thread is thread_member and "hasn't left"; nobody leaves a
-- community chat through thread_leaves, so it needs no change.)

-- 20261127000000_chat_pins_admins.sql: who runs a group chat. In a
-- community's chats: its active admins and committee, nobody else, and only
-- while they're in that chat (so nobody runs a sub-group they aren't in, or
-- an archived one).
create or replace function public.is_thread_admin(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
     and ((exists (select 1 from public.threads t where t.id = tid and (t.event_id is not null or t.social_event_id is not null))
           and public.thread_admin_of(tid, (select auth.uid())))
          or exists (select 1 from public.threads t
                     join public.community_groups g on g.id = t.community_group_id
                     join public.community_members m on m.community_id = g.community_id
                     where t.id = tid and m.user_id = (select auth.uid()) and m.status = 'active'
                       and m.role in ('admin', 'committee'))
             and public.thread_member(tid));
$$;

-- 20261127000000_chat_pins_admins.sql: in a community chat, only its
-- admins and committee pin (a private chat is still either person).
create or replace function public.may_pin(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.can_use_thread(tid)
     and exists (select 1 from public.threads t where t.id = tid
                 and ((t.event_id is null and t.social_event_id is null and t.community_group_id is null) or public.is_thread_admin(tid)));
$$;

-- 20261127000000_chat_pins_admins.sql: the new "joined" and "added" notes
-- can't be pinned either (like "left", "rejoined" and "removed").
create or replace function public.pin_message(mid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  m record;
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  select * into m from public.messages where id = mid;
  if m is null or not public.can_use_thread(m.thread_id) then raise exception 'Message not found'; end if;
  if not public.may_pin(m.thread_id) then raise exception 'Only the chat''s admins can pin messages'; end if;
  if m.deleted_at is not null or m.kind in ('left', 'rejoined', 'removed', 'joined', 'added') then raise exception 'That can''t be pinned'; end if;
  update public.threads set pinned_message_id = mid, pinned_by = auth.uid(), pinned_at = now() where id = m.thread_id;
end;
$$;
revoke execute on function public.pin_message(uuid) from public, anon;
grant execute on function public.pin_message(uuid) to authenticated;

-- 20261125000000_share_events_in_chats.sql: a community chat is a group
-- chat: everyone in it may share events unless its admins or committee
-- switch that off.
create or replace function public.may_share_events(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.threads t
    where t.id = tid and (
      (t.event_id is null and t.social_event_id is null and t.community_group_id is null)
      or t.members_can_share_events
      or public.is_thread_admin(tid)
    )
  );
$$;

-- 20261127000000_chat_pins_admins.sql: leaving a chat. The main chat of a
-- community is left by leaving the community; a sub-group's chat by leaving
-- the group (the others see "<name> left").
create or replace function public.leave_thread(tid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  t record;
  g record;
begin
  if uid is null then raise exception 'Log in first'; end if;
  select * into t from public.threads where id = tid;
  if t is null or not public.thread_member(tid) then raise exception 'Chat not found'; end if;
  if t.community_group_id is not null then
    select * into g from public.community_groups where id = t.community_group_id;
    if g.kind = 'main' then raise exception 'To leave this chat, leave the community instead'; end if;
    perform 1 from public.communities c where c.id = g.community_id for update;
    delete from public.community_group_members where group_id = g.id and user_id = uid;
    if found then
      insert into public.messages (thread_id, sender_id, body, kind) values (tid, uid, 'left the group', 'left');
      update public.threads set last_message_at = now() where id = tid;
    end if;
    return;
  end if;
  if t.event_id is null and t.social_event_id is null then raise exception 'You can only leave group chats'; end if;
  if exists (select 1 from public.thread_leaves where thread_id = tid and user_id = uid) then return; end if;
  if public.thread_admin_of(tid, uid) and public.thread_admin_count(tid) <= 1 then
    raise exception 'You''re this group''s only admin. Make someone else an admin before you leave';
  end if;
  insert into public.thread_leaves (thread_id, user_id) values (tid, uid);
  insert into public.messages (thread_id, sender_id, body, kind) values (tid, uid, 'left the group', 'left');
  update public.threads set last_message_at = now() where id = tid;
end;
$$;

-- 20261127000000_chat_pins_admins.sql: rejoining. Community chats are
-- joined through the community (and its admins add people to sub-groups).
create or replace function public.rejoin_thread(tid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Log in first'; end if;
  if exists (select 1 from public.threads t where t.id = tid and t.community_group_id is not null) then
    if public.thread_member(tid) then return; end if;
    raise exception 'Community chats are joined through the community. Ask its admins or committee to add you to this group';
  end if;
  if not public.thread_member(tid) then raise exception 'Only people going can join this chat'; end if;
  if exists (select 1 from public.thread_leaves where thread_id = tid and user_id = uid and removed_by is not null) then
    raise exception 'An admin removed you from this group';
  end if;
  delete from public.thread_leaves where thread_id = tid and user_id = uid;
  if not found then return; end if;
  insert into public.messages (thread_id, sender_id, body, kind) values (tid, uid, 'rejoined the group', 'rejoined');
  update public.threads set last_message_at = now() where id = tid;
  insert into public.thread_reads (thread_id, user_id, last_read_at) values (tid, uid, now())
  on conflict (thread_id, user_id) do update set last_read_at = now();
end;
$$;

-- 20261127000000_chat_pins_admins.sql: chat admins, removing someone and
-- adding them back. In a community these happen through its own
-- functions (roles, removing people, sub-group members) instead.
create or replace function public.set_thread_admin(tid uuid, uid uuid, make_admin boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  if exists (select 1 from public.threads t where t.id = tid and t.community_group_id is not null) then
    raise exception 'In a community, its admins and committee run the chats. Change roles in Manage';
  end if;
  if not public.can_use_thread(tid) or not public.is_thread_admin(tid) then raise exception 'Only the chat''s admins can do that'; end if;
  if not exists (select 1 from public.thread_people(tid) p where p.user_id = uid) then raise exception 'They''re not in this chat'; end if;
  if make_admin then
    insert into public.thread_admins (thread_id, user_id, added_by) values (tid, uid, auth.uid()) on conflict do nothing;
  else
    if public.thread_organiser(tid, uid) then raise exception 'Organisers are always admins'; end if;
    if public.thread_admin_count(tid) <= 1 and public.thread_admin_of(tid, uid) then raise exception 'A chat needs at least one admin. Make someone else an admin first'; end if;
    delete from public.thread_admins where thread_id = tid and user_id = uid;
  end if;
end;
$$;

create or replace function public.remove_from_thread(tid uuid, uid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  if exists (select 1 from public.threads t where t.id = tid and t.community_group_id is not null) then
    raise exception 'In a community, remove people from the community or from the group in Manage';
  end if;
  if not public.can_use_thread(tid) or not public.is_thread_admin(tid) then raise exception 'Only the chat''s admins can do that'; end if;
  if uid = auth.uid() then raise exception 'To leave, use Leave group'; end if;
  if not exists (select 1 from public.thread_people(tid) p where p.user_id = uid) then raise exception 'They''re not in this chat'; end if;
  if public.thread_organiser(tid, uid) then raise exception 'Organisers can''t be removed from their chat'; end if;
  delete from public.thread_admins where thread_id = tid and user_id = uid;
  insert into public.thread_leaves (thread_id, user_id, removed_by) values (tid, uid, auth.uid())
  on conflict (thread_id, user_id) do update set removed_by = excluded.removed_by, left_at = now();
  insert into public.messages (thread_id, sender_id, body, kind, subject_user_id)
  values (tid, auth.uid(), 'removed ' || public.push_name(uid) || ' from the group', 'removed', uid);
  update public.threads set last_message_at = now() where id = tid;
end;
$$;

create or replace function public.add_back_to_thread(tid uuid, uid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  if exists (select 1 from public.threads t where t.id = tid and t.community_group_id is not null) then
    raise exception 'In a community, add people to its groups in Manage';
  end if;
  if not public.can_use_thread(tid) or not public.is_thread_admin(tid) then raise exception 'Only the chat''s admins can do that'; end if;
  delete from public.thread_leaves where thread_id = tid and user_id = uid and removed_by is not null;
end;
$$;

-- 20261127000000_chat_pins_admins.sql: the member list. A community chat
-- lists its participants by their community nickname (never emails); its
-- admins and committee are its admins. (Their role and membership come
-- from thread_member_roles below.)
create or replace function public.thread_members(tid uuid)
returns table (user_id uuid, name text, avatar_url text, is_admin boolean, is_organiser boolean, is_me boolean, removed boolean)
language sql stable security definer set search_path = ''
as $$
  select p.user_id, coalesce(nullif(pr.display_name, ''), 'Member'), pr.avatar_url,
         public.thread_admin_of(tid, p.user_id), public.thread_organiser(tid, p.user_id), p.user_id = (select auth.uid()), false
  from public.thread_people(tid) p join public.profiles pr on pr.id = p.user_id
  where public.can_use_thread(tid)
    and exists (select 1 from public.threads t where t.id = tid and (t.event_id is not null or t.social_event_id is not null))
  union all
  -- Admins also see who was removed (to add them back), while they still belong in the chat.
  select l.user_id, coalesce(nullif(pr.display_name, ''), 'Member'), pr.avatar_url, false, false, false, true
  from public.thread_leaves l join public.profiles pr on pr.id = l.user_id
  where l.thread_id = tid and l.removed_by is not null and public.is_thread_admin(tid) and public.can_use_thread(tid)
    and public.thread_member_of(tid, l.user_id)
  union all
  -- A community chat: its participants.
  select p.user_id, m.nickname, pr.avatar_url, m.role in ('admin', 'committee'), m.role in ('admin', 'committee'),
         p.user_id = (select auth.uid()), false
  from public.threads t
  join public.community_groups g on g.id = t.community_group_id
  join public.thread_participants p on p.thread_id = t.id
  join public.community_members m on m.community_id = g.community_id and m.user_id = p.user_id and m.status = 'active'
  join public.profiles pr on pr.id = p.user_id
  where t.id = tid and public.can_use_thread(tid)
  order by 7, 4 desc, 2;
$$;

-- A community chat's people with their role and membership, for role
-- colours and tags (nickname and photo only, never emails). Empty for
-- other chats.
create or replace function public.thread_member_roles(tid uuid)
returns table (user_id uuid, nickname text, role text, membership text, avatar_url text, is_me boolean)
language sql stable security definer set search_path = ''
as $$
  select p.user_id, m.nickname, m.role, m.membership, pr.avatar_url, p.user_id = (select auth.uid())
  from public.threads t
  join public.community_groups g on g.id = t.community_group_id
  join public.thread_participants p on p.thread_id = t.id
  join public.community_members m on m.community_id = g.community_id and m.user_id = p.user_id and m.status = 'active'
  join public.profiles pr on pr.id = p.user_id
  where t.id = tid and (public.can_use_thread(tid) or public.is_motive_admin())
  order by case m.role when 'admin' then 0 when 'committee' then 1 else 2 end, lower(m.nickname);
$$;
revoke execute on function public.thread_member_roles(uuid) from public, anon;
grant execute on function public.thread_member_roles(uuid) to authenticated;

-- 20261128000000_reporting_blocking.sql: the chat list, now with more about
-- each chat. my_threads() keeps exactly the columns it always had (the app
-- and older migrations rely on them) and reads from this.
--   Community chats: titled "<community>" (main group) or "<community> ·
--   <group>", with the community's (or group's) picture as other_avatar
--   and image_url, and unread counts that stop at 99.
--   Every chat: whether you muted it and until when (muted_until null with
--   muted true means "until I switch it off").
create or replace function public.my_chat_list()
returns table (
  id uuid, event_id uuid, title text, other_id uuid, other_name text, other_avatar text,
  last_body text, last_at timestamptz, last_sender uuid, unread bigint, social_event_id uuid,
  kind text, community_id uuid, community_slug text, community_group_id uuid, group_kind text,
  image_url text, muted boolean, muted_until timestamptz
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
       or t.id in (select p.thread_id from public.thread_participants p where p.user_id = (select auth.uid()))
  ), ok as materialized (
    select mine.id from mine where public.can_use_thread(mine.id)
  )
  select t.id, t.event_id,
         coalesce(e.title, se.title,
                  case when cg.kind = 'main' then c.name when cg.id is not null then c.name || ' · ' || cg.name end,
                  coalesce(nullif(op.display_name, ''), 'Member')),
         op.id,
         case when cg.id is not null then c.name else coalesce(nullif(op.display_name, ''), 'Member') end,
         case when cg.id is not null then coalesce(cg.image_url, c.image_url) else op.avatar_url end,
         lm.body, coalesce(lm.created_at, t.created_at), lm.sender_id,
         case when t.community_group_id is null then
           (select count(*) from public.messages m
            where m.thread_id = t.id and m.sender_id is distinct from (select auth.uid())
              and m.kind not in ('left', 'rejoined', 'removed', 'joined', 'added')
              and not public.is_blocked_between(m.sender_id, (select auth.uid()))
              and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz))
         else
           (select count(*) from (
              select 1 from public.messages m
              where m.thread_id = t.id and m.sender_id is distinct from (select auth.uid())
                and m.kind not in ('left', 'rejoined', 'removed', 'joined', 'added')
                and m.deleted_at is null
                and not public.is_blocked_between(m.sender_id, (select auth.uid()))
                and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
              limit 99) capped)
         end,
         t.social_event_id,
         t.kind, cg.community_id, c.slug, t.community_group_id, cg.kind,
         case when cg.id is not null then coalesce(cg.image_url, c.image_url) end,
         mu.thread_id is not null, mu.muted_until
  from public.threads t
  join ok on ok.id = t.id
  left join public.events e on e.id = t.event_id
  left join public.social_events se on se.id = t.social_event_id
  left join public.community_groups cg on cg.id = t.community_group_id
  left join public.communities c on c.id = cg.community_id
  left join public.profiles op on op.id = case when t.user_a = (select auth.uid()) then t.user_b else t.user_a end
                               and t.event_id is null and t.social_event_id is null and t.community_group_id is null
  left join public.thread_reads r on r.thread_id = t.id and r.user_id = (select auth.uid())
  left join public.thread_mutes mu on mu.thread_id = t.id and mu.user_id = (select auth.uid())
                                  and (mu.muted_until is null or mu.muted_until > now())
  left join lateral (
    select body, created_at, sender_id from public.messages m
    where m.thread_id = t.id and (m.sender_id is null or not public.is_blocked_between(m.sender_id, (select auth.uid())))
    order by created_at desc limit 1
  ) lm on true
  where (e.id is null or e.ends_at > now() - interval '7 days')
    and (se.id is null or se.ends_at > now() - interval '7 days')
    and (e.id is null or not e.is_draft
         or (e.society_id is not null and public.is_society_committee(e.society_id))
         or e.host_user_id = (select auth.uid()))
  order by coalesce(lm.created_at, t.created_at) desc
  limit 100;
$$;
revoke execute on function public.my_chat_list() from public, anon;
grant execute on function public.my_chat_list() to authenticated;

create or replace function public.my_threads()
returns table (
  id uuid, event_id uuid, title text, other_id uuid, other_name text, other_avatar text,
  last_body text, last_at timestamptz, last_sender uuid, unread bigint, social_event_id uuid
)
language sql stable security definer set search_path = ''
as $$
  select l.id, l.event_id, l.title, l.other_id, l.other_name, l.other_avatar,
         l.last_body, l.last_at, l.last_sender, l.unread, l.social_event_id
  from public.my_chat_list() l
  order by l.last_at desc;
$$;

-- 20261128000000_reporting_blocking.sql: notifications for new messages.
--   Community chats: one step for everyone in the chat except the sender,
--   skipping muted, blocked (either way) and banned people, anyone without
--   a phone or browser set up, and anyone who turned "Messages" off.
--   Titled "<community>" or "<community> · <group>", reading
--   "<nickname>: <message>".
--   Every other chat: the same people as before, minus anyone who muted it.
--   Notes ("joined", "added", as well as "left", "rejoined", "removed")
--   never notify.
create or replace function public.push_on_message()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  t record;
  grp record;
  who text := public.push_name(new.sender_id);
  preview text := left(coalesce(new.body, ''), 100);
  nick text;
  r uuid;
  other uuid;
begin
  if new.sender_id is null or new.kind in ('left', 'rejoined', 'removed', 'joined', 'added') then return new; end if;
  if new.kind = 'event' then preview := left(regexp_replace(preview, ' https://\S+$', ''), 100); end if;
  select * into t from public.threads where id = new.thread_id;
  if t is null then return new; end if;
  if t.community_group_id is not null then
    select g.kind, g.name as group_name, c.id as community_id, c.name as community_name into grp
    from public.community_groups g join public.communities c on c.id = g.community_id
    where g.id = t.community_group_id;
    if not found then return new; end if;
    select m.nickname into nick from public.community_members m
    where m.community_id = grp.community_id and m.user_id = new.sender_id;
    insert into public.push_queue (user_id, kind, title, body, url)
    select p.user_id, 'messages',
           left(case when grp.kind = 'main' then grp.community_name else grp.community_name || ' · ' || grp.group_name end, 120),
           left(coalesce(nick, who) || ': ' || preview, 200),
           '/chats/' || t.id
    from public.thread_participants p
    where p.thread_id = t.id and p.user_id <> new.sender_id
      and exists (select 1 from public.push_tokens k where k.user_id = p.user_id)
      and not exists (select 1 from public.notification_settings s where s.user_id = p.user_id and s.messages is false)
      and not exists (select 1 from public.thread_mutes mu where mu.thread_id = t.id and mu.user_id = p.user_id
                        and (mu.muted_until is null or mu.muted_until > now()))
      and not exists (select 1 from public.user_blocks b where b.blocker_id = p.user_id and b.blocked_id = new.sender_id)
      and not exists (select 1 from public.user_blocks b where b.blocker_id = new.sender_id and b.blocked_id = p.user_id)
      and not exists (select 1 from public.account_bans ab where ab.user_id = p.user_id and (ab.until is null or ab.until > now()));
    return new;
  end if;
  if t.event_id is null and t.social_event_id is null then
    other := case when t.user_a = new.sender_id then t.user_b else t.user_a end;
    if not exists (select 1 from public.thread_mutes mu where mu.thread_id = t.id and mu.user_id = other
                     and (mu.muted_until is null or mu.muted_until > now())) then
      perform public.queue_push(other, 'messages', who, preview, '/chats/' || t.id);
    end if;
  elsif t.event_id is not null then
    for r in
      select distinct u from (
        select e.host_user_id as u from public.events e where e.id = t.event_id
        union select en.user_id from public.event_entries en where en.event_id = t.event_id and en.status = 'going'
          and not exists (select 1 from public.events d where d.id = t.event_id and d.is_draft)
        union select a.user_id from public.society_admins a join public.events e on e.society_id = a.society_id where e.id = t.event_id
      ) x where u is not null and u <> new.sender_id
        and not exists (select 1 from public.thread_leaves l where l.thread_id = t.id and l.user_id = x.u)
        and not public.is_blocked_between(x.u, new.sender_id)
        and not exists (select 1 from public.thread_mutes mu where mu.thread_id = t.id and mu.user_id = x.u
                          and (mu.muted_until is null or mu.muted_until > now()))
    loop
      perform public.queue_push(r, 'messages', who || ' in ' || (select title from public.events where id = t.event_id), preview, '/chats/' || t.id);
    end loop;
  else
    for r in
      select distinct u from (
        select se.host_id as u from public.social_events se where se.id = t.social_event_id
        union select m.user_id from public.social_event_members m where m.event_id = t.social_event_id and m.status = 'going'
      ) x where u is not null and u <> new.sender_id
        and not exists (select 1 from public.thread_leaves l where l.thread_id = t.id and l.user_id = x.u)
        and not public.is_blocked_between(x.u, new.sender_id)
        and not exists (select 1 from public.thread_mutes mu where mu.thread_id = t.id and mu.user_id = x.u
                          and (mu.muted_until is null or mu.muted_until > now()))
    loop
      perform public.queue_push(r, 'messages', who || ' in ' || (select title from public.social_events where id = t.social_event_id), preview, '/chats/' || t.id);
    end loop;
  end if;
  return new;
end;
$$;

-- 20261128000000_reporting_blocking.sql: report emails name the community
-- chat a reported message was in.
create or replace function public.email_on_report()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  what text;
  lines text := '';
  m record;
  e record;
begin
  if new.message_id is not null then
    select msg.*, t.event_id as t_event, t.social_event_id as t_social, t.community_group_id as t_group,
           c.name as t_community, g.name as t_group_name, g.kind as t_group_kind into m
      from public.messages msg join public.threads t on t.id = msg.thread_id
      left join public.community_groups g on g.id = t.community_group_id
      left join public.communities c on c.id = g.community_id
      where msg.id = new.message_id;
    what := case m.kind when 'photo' then 'a photo in a chat' when 'video' then 'a video in a chat' when 'event' then 'an event shared in a chat' else 'a chat message' end;
    lines := 'Sent by: ' || public.report_person(m.sender_id) || chr(10)
      || 'Content: ' || coalesce(m.body, '') || chr(10)
      || 'Chat: ' || case when m.t_group is not null then 'a community chat: ' || coalesce(m.t_community, '?')
                            || case when m.t_group_kind = 'sub' then ' · ' || coalesce(m.t_group_name, '?') else '' end
                          when m.t_event is not null or m.t_social is not null then 'a group chat'
                          else 'a private chat' end || ' (id ' || m.thread_id || ')';
  elsif new.event_id is not null then
    select ev.title, ev.host_user_id, ev.society_id into e from public.events ev where ev.id = new.event_id;
    what := 'an event listing';
    lines := 'Event: ' || coalesce(e.title, '?') || ' — https://studentfunction.com/e/' || new.event_id || chr(10)
      || case when e.host_user_id is not null then 'Hosted by: ' || public.report_person(e.host_user_id) else 'Society event' end;
  elsif new.reported_user_id is not null then
    what := 'a person';
    lines := 'Person: ' || public.report_person(new.reported_user_id) || ' — https://studentfunction.com/u/' || new.reported_user_id;
  elsif new.society_id is not null then
    what := 'a society';
    lines := 'Society: ' || coalesce((select s.name from public.societies s where s.id = new.society_id), '?') || ' (id ' || new.society_id || ')';
  else
    what := 'something';
  end if;
  perform public.queue_report_email(what, new.reason, new.details, new.reporter_id, lines, new.id::text);
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Live chat (Supabase Realtime "broadcast from database")
-- ---------------------------------------------------------------------

-- The chat a Realtime topic is about ('thread:<chat id>'), or null.
create or replace function public.thread_topic_id(topic text)
returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  if topic ~ '^thread:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return substr(topic, 8)::uuid;
  end if;
  return null;
end;
$$;
revoke execute on function public.thread_topic_id(text) from public, anon;
grant execute on function public.thread_topic_id(text) to authenticated;

-- Tell anyone listening to a chat that a message arrived or was deleted:
-- its id only (never its text or who sent it); the app loads it through
-- the normal rules. Every kind of chat. A Realtime problem never stops a
-- message being sent.
create or replace function public.broadcast_message_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('id', new.id, 'op', case when tg_op = 'INSERT' then 'insert' else 'delete' end),
      'message',
      'thread:' || new.thread_id::text,
      true);
  exception when others then
    null;
  end;
  return null;
end;
$$;
revoke execute on function public.broadcast_message_change() from public, anon, authenticated;

drop trigger if exists messages_broadcast_insert on public.messages;
create trigger messages_broadcast_insert after insert on public.messages
  for each row execute function public.broadcast_message_change();
drop trigger if exists messages_broadcast_delete on public.messages;
create trigger messages_broadcast_delete after update of deleted_at on public.messages
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.broadcast_message_change();

-- Who may listen: people who can use the chat (private topics only; there
-- is no insert rule, so nobody can broadcast from the app). Skipped if this
-- database has no Realtime (every Supabase project has it).
do $do$
begin
  if to_regclass('realtime.messages') is not null and to_regprocedure('realtime.topic()') is not null then
    execute 'drop policy if exists function_thread_listeners on realtime.messages';
    execute $sql$
      create policy function_thread_listeners on realtime.messages for select to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and public.can_use_thread(public.thread_topic_id((select realtime.topic())))
      )
    $sql$;
  end if;
end
$do$;

-- ---------------------------------------------------------------------
-- 5. Community functions. Each checks the caller's role in that
--    community and locks the community's row before changing anything,
--    so two people acting at once can't break the rules (e.g. two admins
--    demoting each other). Function admins pass every role check.
-- ---------------------------------------------------------------------

-- 5a. Nicknames: tidied (NFKC, so fullwidth and other styled letters become
--     plain ones; emoji style selectors dropped; spaces, including Unicode
--     ones, trimmed), 1 to 30 characters, no control or invisible
--     characters, and not "Admin", "Committee", "Member", "Moderator" or
--     "Function" (ignoring case, spaces and anything that isn't a letter,
--     and reading Cyrillic and Greek look-alikes as the Latin letters they
--     look like). Any reserved word inside the nickname ("Function Team",
--     "Admins", "Committee Member", "Mod") is refused too. The same rules as
--     validateNickname in packages/shared/src/communities.ts.

-- How a nickname compares with others (for the reserved words and for
-- "taken"): NFKC, Cyrillic and Greek capitals that look like Latin ones as
-- those, lower case, then the small look-alikes as Latin too. So "Sammy"
-- spelt with a Cyrillic S is the same as "Sammy", and "Admin" spelt with a
-- Cyrillic or Greek A is "admin".
create or replace function public.community_nickname_key(nick text)
returns text
language sql immutable set search_path = ''
as $$
  select translate(
    lower(translate(normalize(coalesce(nick, ''), NFKC),
      U&'\0410\0412\0421\0415\041D\0406\0408\041A\041C\041E\0420\0405\0422\0425\0423\0500\04BA\04C0\0391\0392\0395\0397\0399\039A\039C\039D\039F\03A1\03A4\03A5\03A7\0396',
      'ABCEHIJKMOPSTXYDHIABEHIKMNOPTYXZ')),
    U&'\0430\0432\0441\0435\043D\0456\0458\043A\043C\043E\0440\0442\0445\0443\0455\0501\04BB\04CF\03BF\03B1\03B9\03BD\03BA\03C4\03BC\03B5\03C1\03C7\03C5\03B7',
    'abcehijkmoptxysdhloaivktmepxun');
$$;

-- A nickname as typed, tidied: NFKC, without emoji style selectors (U+FE0E
-- and U+FE0F, which a phone adds after some emoji; the emoji stays), trimmed
-- of spaces (including no-break and other Unicode spaces).
create or replace function public.community_nickname_tidy(raw text)
returns text
language sql immutable set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(normalize(coalesce(raw, ''), NFKC), '[\uFE0E\uFE0F]', '', 'g'),
    '^[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+|[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$', '', 'g');
$$;

-- What's wrong with a nickname, or null if it's fine. Hidden: soft hyphen,
-- joiners and other zero-width characters, direction marks and isolates,
-- variation selectors, and the Hangul and Braille blanks.
create or replace function public.community_nickname_problem(nick text)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when n is null or n = '' then 'Choose a nickname'
    when char_length(n) > 30 then 'Nicknames can be up to 30 characters'
    when n ~ '[[:cntrl:]]'
      or n ~ '[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u2028-\u202E\u2060-\u206F\u2800\u3164\uFE00-\uFE0F\uFEFF\uFFA0]'
      then 'Nicknames can''t contain hidden or control characters'
    when regexp_replace(k, '[^a-z]', '', 'g') in ('admin', 'committee', 'member', 'moderator', 'function')
      or exists (select 1 from regexp_matches(k, '[a-z]+', 'g') w
                 where w[1] in ('admin', 'admins', 'committee', 'committees', 'member', 'members', 'moderator', 'moderators', 'mod', 'mods', 'function'))
      then 'That nickname is reserved. Choose another'
    else null
  end
  from (select normalize(nick, NFKC) as n, public.community_nickname_key(nick) as k) x;
$$;

-- The tidied nickname, or an error saying what's wrong with it.
create or replace function public.clean_community_nickname(raw text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  nick text := public.community_nickname_tidy(raw);
  problem text := public.community_nickname_problem(nick);
begin
  if problem is not null then raise exception '%', problem; end if;
  return nick;
end;
$$;

-- Is this nickname taken by someone else waiting or in the community?
-- (Ignoring case, and look-alikes: see community_nickname_key.)
create or replace function public.community_nickname_taken(cid uuid, nick text, person uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.community_members m
                 where m.community_id = cid
                   and (lower(m.nickname) = lower(nick) or public.community_nickname_key(m.nickname) = public.community_nickname_key(nick))
                   and m.status in ('pending', 'active') and m.user_id <> person);
$$;

-- A nickname for someone added by the Function team: their profile
-- nickname, else their first name, made unique with a number if needed.
create or replace function public.community_default_nickname(cid uuid, person uuid)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  p record;
  candidate text;
  base text;
  n integer := 2;
begin
  select * into p from public.profiles where id = person;
  foreach candidate in array array[
    p.nickname,
    split_part(regexp_replace(coalesce(p.full_name, ''), '^\s+', ''), ' ', 1),
    split_part(regexp_replace(coalesce(p.display_name, ''), '^\s+', ''), ' ', 1),
    'Friend'
  ] loop
    candidate := regexp_replace(left(public.community_nickname_tidy(candidate), 30), '\s+$', '');
    if public.community_nickname_problem(candidate) is null then
      base := candidate;
      exit;
    end if;
  end loop;
  candidate := base;
  while public.community_nickname_taken(cid, candidate, person) loop
    candidate := left(base, 30 - char_length(' ' || n)) || ' ' || n;
    n := n + 1;
  end loop;
  return candidate;
end;
$$;

revoke execute on function public.community_nickname_key(text) from public, anon, authenticated;
revoke execute on function public.community_nickname_tidy(text) from public, anon, authenticated;
revoke execute on function public.community_nickname_problem(text) from public, anon, authenticated;
revoke execute on function public.clean_community_nickname(text) from public, anon, authenticated;
revoke execute on function public.community_nickname_taken(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.community_default_nickname(uuid, uuid) from public, anon, authenticated;

-- The role colours to show: the community's own, falling back to the
-- defaults for anything missing.
create or replace function public.community_role_colours(settings jsonb)
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'admin', coalesce(settings->'role_colours'->'admin', '{"light": "#8A5A00", "dark": "#F5C04A"}'::jsonb),
    'committee', coalesce(settings->'role_colours'->'committee', '{"light": "#7A1010", "dark": "#FF5A5A"}'::jsonb),
    'member', coalesce(settings->'role_colours'->'member', '{"light": "#C4362E", "dark": "#FFB8B3"}'::jsonb),
    'non_member', coalesce(settings->'role_colours'->'non_member', '{"light": "#6B6B73", "dark": "#9A9AA3"}'::jsonb));
$$;
revoke execute on function public.community_role_colours(jsonb) from public, anon, authenticated;

-- What's wrong with a community's settings, or null if they're fine. Only
-- three settings exist (none of them about roles): role_colours (each role
-- light and dark, as #RRGGBB), membership_label and marketplace_enabled.
create or replace function public.community_settings_problem(s jsonb)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  k text;
  r text;
  scheme text;
  colour text;
begin
  if s is null or jsonb_typeof(s) <> 'object' then return 'Settings must be an object'; end if;
  for k in select jsonb_object_keys(s) loop
    if k not in ('role_colours', 'membership_label', 'marketplace_enabled') then return 'Unknown setting: ' || k; end if;
  end loop;
  if s ? 'role_colours' then
    if jsonb_typeof(s->'role_colours') <> 'object' then return 'Role colours must be an object'; end if;
    for k in select jsonb_object_keys(s->'role_colours') loop
      if k not in ('admin', 'committee', 'member', 'non_member') then return 'Unknown role colour: ' || k; end if;
    end loop;
    foreach r in array array['admin', 'committee', 'member', 'non_member'] loop
      if jsonb_typeof(s->'role_colours'->r) is distinct from 'object' then return 'Give a light and a dark colour for ' || r; end if;
      for k in select jsonb_object_keys(s->'role_colours'->r) loop
        if k not in ('light', 'dark') then return 'Colours are light or dark, not ' || k; end if;
      end loop;
      foreach scheme in array array['light', 'dark'] loop
        if jsonb_typeof(s->'role_colours'->r->scheme) is distinct from 'string' then return 'Colours must look like #RRGGBB'; end if;
        colour := s->'role_colours'->r->>scheme;
        if colour !~ '^#[0-9A-Fa-f]{6}$' then return 'Colours must look like #RRGGBB'; end if;
      end loop;
    end loop;
  end if;
  if s ? 'membership_label' and (jsonb_typeof(s->'membership_label') <> 'string'
      or char_length(btrim(s->>'membership_label')) not between 1 and 40) then
    return 'The membership label must be 1 to 40 characters';
  end if;
  if s ? 'marketplace_enabled' and jsonb_typeof(s->'marketplace_enabled') <> 'boolean' then
    return 'marketplace_enabled must be true or false';
  end if;
  return null;
end;
$$;
revoke execute on function public.community_settings_problem(jsonb) from public, anon, authenticated;

-- An image address for a community: empty means none; otherwise https only.
create or replace function public.community_image_url(url text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  clean text := nullif(btrim(coalesce(url, '')), '');
begin
  if clean is null then return null; end if;
  if clean !~ '^https://' or char_length(clean) > 2000 then raise exception 'Images must be https:// links'; end if;
  return clean;
end;
$$;
revoke execute on function public.community_image_url(text) from public, anon, authenticated;

-- 5b. Reading.

-- The public card (for the join screen and link previews): anyone, even
-- logged out.
create or replace function public.community_public(community_slug text)
returns table (id uuid, slug text, name text, bio text, image_url text, banner_url text)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.slug, c.name, c.bio, c.image_url, c.banner_url
  from public.communities c where c.slug = lower(btrim(community_slug));
$$;
revoke execute on function public.community_public(text) from public;
grant execute on function public.community_public(text) to anon, authenticated;

-- The community page: the community, your own place in it, its role
-- colours, and the groups you can see (each with its chat). Null if
-- there's no such community.
create or replace function public.community_home(community_slug text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  c record;
  me record;
  fa boolean := public.is_motive_admin();
  manager boolean;
  active boolean;
  had_row boolean;
  groups jsonb;
begin
  if uid is null then raise exception 'Log in first'; end if;
  select * into c from public.communities x where x.slug = lower(btrim(community_slug));
  if not found then return null; end if;
  select m.status, m.role, m.membership, m.nickname, m.membership_claimed into me
  from public.community_members m where m.community_id = c.id and m.user_id = uid;
  had_row := found;
  active := had_row and me.status = 'active';
  manager := active and me.role in ('admin', 'committee');
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'name', g.name, 'description', g.description, 'kind', g.kind, 'image_url', g.image_url,
           'sort', g.sort, 'thread_id', t.id,
           'joined', case when g.kind = 'main' then active
                          else active and exists (select 1 from public.community_group_members gm where gm.group_id = g.id and gm.user_id = uid) end,
           'member_count', case when g.kind = 'main'
                                then (select count(*) from public.community_members m2 where m2.community_id = c.id and m2.status = 'active')
                                else (select count(*) from public.community_group_members gm where gm.group_id = g.id) end)
           order by g.kind = 'sub', g.sort, lower(g.name)), '[]'::jsonb)
    into groups
  from public.community_groups g
  join public.threads t on t.community_group_id = g.id
  where g.community_id = c.id and g.archived_at is null
    and (fa or manager
         or (active and g.kind = 'main')
         or (active and exists (select 1 from public.community_group_members gm where gm.group_id = g.id and gm.user_id = uid)));
  return jsonb_build_object(
    'community', jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'bio', c.bio, 'image_url', c.image_url,
                                    'banner_url', c.banner_url, 'society_id', c.society_id,
                                    'membership_label', coalesce(c.settings->>'membership_label', 'paying member'),
                                    'marketplace_enabled', coalesce((c.settings->>'marketplace_enabled')::boolean, false)),
    'me', case when not had_row then null else jsonb_build_object(
            'status', me.status, 'role', me.role, 'membership', me.membership, 'nickname', me.nickname,
            'membership_claimed', me.membership_claimed) end,
    'is_function_admin', fa,
    'role_colours', public.community_role_colours(c.settings),
    'groups', groups,
    'pending_requests', case when fa or manager
                             then (select count(*) from public.community_members m3 where m3.community_id = c.id and m3.status = 'pending') end);
end;
$$;
revoke execute on function public.community_home(text) from public, anon;
grant execute on function public.community_home(text) to authenticated;

-- The communities you're in or waiting to join.
create or replace function public.my_communities()
returns table (id uuid, slug text, name text, image_url text, role text, membership text, status text, nickname text, main_thread_id uuid)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.slug, c.name, c.image_url, m.role, m.membership, m.status, m.nickname,
         case when m.status = 'active' then t.id end
  from public.community_members m
  join public.communities c on c.id = m.community_id
  left join public.community_groups g on g.community_id = c.id and g.kind = 'main'
  left join public.threads t on t.community_group_id = g.id
  where m.user_id = (select auth.uid()) and m.status in ('pending', 'active')
  order by m.status = 'pending', lower(c.name);
$$;
revoke execute on function public.my_communities() from public, anon;
grant execute on function public.my_communities() to authenticated;

-- Everyone active in a community: nickname, role, membership and photo
-- (never emails or paying-member claims). For its members and the Function team.
create or replace function public.community_roster(cid uuid)
returns table (user_id uuid, nickname text, role text, membership text, avatar_url text)
language sql stable security definer set search_path = ''
as $$
  select m.user_id, m.nickname, m.role, m.membership, p.avatar_url
  from public.community_members m join public.profiles p on p.id = m.user_id
  where m.community_id = cid and m.status = 'active'
    and (public.is_community_member(cid) or public.is_motive_admin())
  order by case m.role when 'admin' then 0 when 'committee' then 1 else 2 end, m.membership = 'non_member', lower(m.nickname);
$$;
revoke execute on function public.community_roster(uuid) from public, anon;
grant execute on function public.community_roster(uuid) to authenticated;

-- Requests waiting for a decision (admins, committee and the Function team).
-- Shows the paying-member claim; never emails.
create or replace function public.community_requests(cid uuid)
returns table (user_id uuid, nickname text, display_name text, full_name text, university text, avatar_url text,
               membership_claimed boolean, requested_at timestamptz, referred_by_nickname text)
language sql stable security definer set search_path = ''
as $$
  select m.user_id, m.nickname, coalesce(nullif(p.display_name, ''), 'Member'), nullif(p.full_name, ''), p.university, p.avatar_url,
         m.membership_claimed, m.requested_at, rm.nickname
  from public.community_members m
  join public.profiles p on p.id = m.user_id
  left join public.community_members rm on rm.community_id = m.community_id and rm.user_id = m.referred_by and rm.status = 'active'
  where m.community_id = cid and m.status = 'pending'
    and (public.is_community_manager(cid) or public.is_motive_admin())
  order by m.requested_at;
$$;
revoke execute on function public.community_requests(uuid) from public, anon;
grant execute on function public.community_requests(uuid) to authenticated;

-- Who's in a group: its members, for the group's members, the community's
-- admins and committee, and the Function team. (The main group: everyone active.)
create or replace function public.group_members(gid uuid)
returns table (user_id uuid, nickname text, role text, membership text, avatar_url text, added_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.user_id, m.nickname, m.role, m.membership, p.avatar_url, coalesce(gm.added_at, m.decided_at)
  from public.community_groups g
  join public.community_members m on m.community_id = g.community_id and m.status = 'active'
  join public.profiles p on p.id = m.user_id
  left join public.community_group_members gm on gm.group_id = g.id and gm.user_id = m.user_id
  where g.id = gid and (g.kind = 'main' or gm.user_id is not null)
    and public.can_see_community_group(gid)
  order by case m.role when 'admin' then 0 when 'committee' then 1 else 2 end, lower(m.nickname);
$$;
revoke execute on function public.group_members(uuid) from public, anon;
grant execute on function public.group_members(uuid) to authenticated;

-- 5c. Joining.

-- Ask to join (or update a waiting request). Returns the status: 'pending',
-- or 'active' if you're already in. Someone removed can't rejoin.
create or replace function public.request_to_join(community_slug text, wanted_nickname text, claims_membership boolean, ref uuid default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  c record;
  mem record;
  had_row boolean;
  nick text;
  referrer uuid;
begin
  if uid is null then raise exception 'Log in first'; end if;
  select * into c from public.communities x where x.slug = lower(btrim(community_slug)) for update;
  if not found then raise exception 'Community not found'; end if;
  select * into mem from public.community_members m where m.community_id = c.id and m.user_id = uid for update;
  had_row := found;
  if had_row and mem.status = 'removed' then raise exception 'You can''t rejoin this community'; end if;
  if had_row and mem.status = 'active' then return 'active'; end if;
  nick := public.clean_community_nickname(wanted_nickname);
  if public.community_nickname_taken(c.id, nick, uid) then raise exception 'That nickname is taken in this community. Try another'; end if;
  -- Who shared the link: only kept if they're in the community.
  if ref is not null and ref <> uid and exists (select 1 from public.community_members m where m.community_id = c.id and m.user_id = ref and m.status = 'active') then
    referrer := ref;
  end if;
  if not had_row then
    insert into public.community_members (community_id, user_id, nickname, membership_claimed, status, referred_by)
    values (c.id, uid, nick, coalesce(claims_membership, false), 'pending', referrer);
  elsif mem.status = 'pending' then
    update public.community_members
    set nickname = nick, membership_claimed = coalesce(claims_membership, false), referred_by = coalesce(referrer, referred_by)
    where community_id = c.id and user_id = uid;
  else
    -- Declined or left: a fresh request.
    update public.community_members
    set nickname = nick, membership_claimed = coalesce(claims_membership, false), status = 'pending', role = 'regular',
        membership = 'non_member', requested_at = now(), decided_by = null, decided_at = null,
        membership_confirmed_by = null, membership_confirmed_at = null, referred_by = referrer
    where community_id = c.id and user_id = uid;
  end if;
  return 'pending';
exception when unique_violation then
  raise exception 'That nickname is taken in this community. Try another';
end;
$$;
revoke execute on function public.request_to_join(text, text, boolean, uuid) from public, anon;
grant execute on function public.request_to_join(text, text, boolean, uuid) to authenticated;

-- Change your nickname (while waiting or in the community).
create or replace function public.update_my_community_nickname(cid uuid, wanted_nickname text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  nick text;
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform 1 from public.communities c where c.id = cid for update;
  if not found then raise exception 'Community not found'; end if;
  perform 1 from public.community_members m where m.community_id = cid and m.user_id = uid and m.status in ('pending', 'active') for update;
  if not found then raise exception 'You''re not in this community'; end if;
  nick := public.clean_community_nickname(wanted_nickname);
  if public.community_nickname_taken(cid, nick, uid) then raise exception 'That nickname is taken in this community. Try another'; end if;
  update public.community_members set nickname = nick where community_id = cid and user_id = uid;
exception when unique_violation then
  raise exception 'That nickname is taken in this community. Try another';
end;
$$;
revoke execute on function public.update_my_community_nickname(uuid, text) from public, anon;
grant execute on function public.update_my_community_nickname(uuid, text) to authenticated;

-- Leave (or withdraw a request). The last admin can't leave.
create or replace function public.leave_community(cid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mem record;
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform 1 from public.communities c where c.id = cid for update;
  if not found then raise exception 'Community not found'; end if;
  select * into mem from public.community_members m where m.community_id = cid and m.user_id = uid for update;
  if not found or mem.status not in ('pending', 'active') then raise exception 'You''re not in this community'; end if;
  if mem.status = 'active' and mem.role = 'admin'
     and (select count(*) from public.community_members m where m.community_id = cid and m.status = 'active' and m.role = 'admin') <= 1 then
    raise exception 'You''re the only admin. Make someone else an admin before you leave';
  end if;
  update public.community_members
  set status = 'left', role = 'regular', membership = 'non_member', decided_by = uid, decided_at = now()
  where community_id = cid and user_id = uid;
end;
$$;
revoke execute on function public.leave_community(uuid) from public, anon;
grant execute on function public.leave_community(uuid) to authenticated;

-- 5d. Approvals, membership, roles and removal.

-- Approve a request: admins as a paying member or not; committee always
-- as a non-member (the claim stays for an admin to confirm later).
create or replace function public.approve_request(cid uuid, target uuid, as_member boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  fa boolean := public.is_motive_admin();
  my_role text;
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform 1 from public.communities c where c.id = cid for update;
  if not found then raise exception 'Community not found'; end if;
  my_role := public.community_role_of(cid, uid);
  if not fa and coalesce(my_role, '') not in ('admin', 'committee') then
    raise exception 'Only the community''s admins and committee can do that';
  end if;
  if coalesce(as_member, false) and not fa and my_role <> 'admin' then
    raise exception 'Only admins can approve someone as a paying member';
  end if;
  perform 1 from public.community_members m where m.community_id = cid and m.user_id = target and m.status = 'pending' for update;
  if not found then raise exception 'That request isn''t waiting any more'; end if;
  update public.community_members
  set status = 'active', role = 'regular',
      membership = case when coalesce(as_member, false) then 'member' else 'non_member' end,
      membership_confirmed_by = case when coalesce(as_member, false) then uid end,
      membership_confirmed_at = case when coalesce(as_member, false) then now() end,
      decided_by = uid, decided_at = now()
  where community_id = cid and user_id = target;
end;
$$;
revoke execute on function public.approve_request(uuid, uuid, boolean) from public, anon;
grant execute on function public.approve_request(uuid, uuid, boolean) to authenticated;

create or replace function public.decline_request(cid uuid, target uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform 1 from public.communities c where c.id = cid for update;
  if not found then raise exception 'Community not found'; end if;
  if not public.is_motive_admin() and coalesce(public.community_role_of(cid, uid), '') not in ('admin', 'committee') then
    raise exception 'Only the community''s admins and committee can do that';
  end if;
  perform 1 from public.community_members m where m.community_id = cid and m.user_id = target and m.status = 'pending' for update;
  if not found then raise exception 'That request isn''t waiting any more'; end if;
  update public.community_members set status = 'declined', decided_by = uid, decided_at = now()
  where community_id = cid and user_id = target;
end;
$$;
revoke execute on function public.decline_request(uuid, uuid) from public, anon;
grant execute on function public.decline_request(uuid, uuid) to authenticated;

-- Confirm (or undo) someone's paying membership: admins only, never your own.
create or replace function public.confirm_membership(cid uuid, target uuid, is_member boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  fa boolean := public.is_motive_admin();
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform 1 from public.communities c where c.id = cid for update;
  if not found then raise exception 'Community not found'; end if;
  if not fa and public.community_role_of(cid, uid) is distinct from 'admin' then
    raise exception 'Only the community''s admins can do that';
  end if;
  if target = uid and not fa then raise exception 'You can''t change your own membership'; end if;
  perform 1 from public.community_members m where m.community_id = cid and m.user_id = target and m.status = 'active' for update;
  if not found then raise exception 'They''re not an active member of this community'; end if;
  update public.community_members
  set membership = case when coalesce(is_member, false) then 'member' else 'non_member' end,
      membership_confirmed_by = case when coalesce(is_member, false) then uid end,
      membership_confirmed_at = case when coalesce(is_member, false) then now() end
  where community_id = cid and user_id = target;
end;
$$;
revoke execute on function public.confirm_membership(uuid, uuid, boolean) from public, anon;
grant execute on function public.confirm_membership(uuid, uuid, boolean) to authenticated;

-- Set someone's role: admins only, never your own, and never leaving the
-- community without an admin.
create or replace function public.set_community_role(cid uuid, target uuid, new_role text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  fa boolean := public.is_motive_admin();
  current_role_of_target text;
begin
  if uid is null then raise exception 'Log in first'; end if;
  if new_role is null or new_role not in ('admin', 'committee', 'regular') then raise exception 'Choose admin, committee or regular'; end if;
  perform 1 from public.communities c where c.id = cid for update;
  if not found then raise exception 'Community not found'; end if;
  if not fa and public.community_role_of(cid, uid) is distinct from 'admin' then
    raise exception 'Only the community''s admins can do that';
  end if;
  if target = uid and not fa then raise exception 'You can''t change your own role'; end if;
  select m.role into current_role_of_target from public.community_members m
  where m.community_id = cid and m.user_id = target and m.status = 'active' for update;
  if not found then raise exception 'They''re not an active member of this community'; end if;
  if current_role_of_target = 'admin' and new_role <> 'admin'
     and (select count(*) from public.community_members m where m.community_id = cid and m.status = 'active' and m.role = 'admin') <= 1 then
    raise exception 'A community needs at least one admin. Make someone else an admin first';
  end if;
  update public.community_members set role = new_role where community_id = cid and user_id = target;
end;
$$;
revoke execute on function public.set_community_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_community_role(uuid, uuid, text) to authenticated;

-- Remove someone: admins remove anyone except the last admin; committee
-- remove regular people only; nobody removes themselves (they leave).
-- Someone removed can't rejoin through the link.
create or replace function public.remove_community_member(cid uuid, target uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  fa boolean := public.is_motive_admin();
  my_role text;
  mem record;
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform 1 from public.communities c where c.id = cid for update;
  if not found then raise exception 'Community not found'; end if;
  my_role := public.community_role_of(cid, uid);
  if not fa and coalesce(my_role, '') not in ('admin', 'committee') then
    raise exception 'Only the community''s admins and committee can do that';
  end if;
  if target = uid then raise exception 'To leave, use Leave community'; end if;
  select * into mem from public.community_members m where m.community_id = cid and m.user_id = target for update;
  if not found or mem.status not in ('pending', 'active') then raise exception 'They''re not in this community'; end if;
  if not fa and my_role = 'committee' and mem.role <> 'regular' then
    raise exception 'Only admins can remove committee members and admins';
  end if;
  if mem.status = 'active' and mem.role = 'admin'
     and (select count(*) from public.community_members m where m.community_id = cid and m.status = 'active' and m.role = 'admin') <= 1 then
    raise exception 'A community needs at least one admin. Make someone else an admin first';
  end if;
  update public.community_members
  set status = 'removed', role = 'regular', membership = 'non_member', decided_by = uid, decided_at = now()
  where community_id = cid and user_id = target;
end;
$$;
revoke execute on function public.remove_community_member(uuid, uuid) from public, anon;
grant execute on function public.remove_community_member(uuid, uuid) to authenticated;

-- 5e. The community's page and settings.

-- Bio, picture and banner: admins and committee.
create or replace function public.update_community_profile(cid uuid, new_bio text, new_image_url text, new_banner_url text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  clean_bio text := btrim(coalesce(new_bio, ''));
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform 1 from public.communities c where c.id = cid for update;
  if not found then raise exception 'Community not found'; end if;
  if not public.is_motive_admin() and coalesce(public.community_role_of(cid, uid), '') not in ('admin', 'committee') then
    raise exception 'Only the community''s admins and committee can do that';
  end if;
  if char_length(clean_bio) > 1000 then raise exception 'The bio can be up to 1,000 characters'; end if;
  update public.communities
  set bio = clean_bio, image_url = public.community_image_url(new_image_url), banner_url = public.community_image_url(new_banner_url)
  where id = cid;
end;
$$;
revoke execute on function public.update_community_profile(uuid, text, text, text) from public, anon;
grant execute on function public.update_community_profile(uuid, text, text, text) to authenticated;

-- Name and settings: admins only. Settings given are merged into the
-- current ones (null keeps them; so does a null name).
create or replace function public.update_community_settings(cid uuid, new_name text, new_settings jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  c record;
  merged jsonb;
  problem text;
  clean_name text := btrim(coalesce(new_name, ''));
begin
  if uid is null then raise exception 'Log in first'; end if;
  select * into c from public.communities x where x.id = cid for update;
  if not found then raise exception 'Community not found'; end if;
  if not public.is_motive_admin() and public.community_role_of(cid, uid) is distinct from 'admin' then
    raise exception 'Only the community''s admins can do that';
  end if;
  if new_name is not null and char_length(clean_name) not between 1 and 80 then raise exception 'The name must be 1 to 80 characters'; end if;
  if new_settings is not null and jsonb_typeof(new_settings) <> 'object' then raise exception 'Settings must be an object'; end if;
  merged := c.settings || coalesce(new_settings, '{}'::jsonb);
  problem := public.community_settings_problem(merged);
  if problem is not null then raise exception '%', problem; end if;
  update public.communities
  set name = case when new_name is null then name else clean_name end, settings = merged
  where id = cid;
  -- The main group is named after the community.
  if new_name is not null then
    update public.community_groups set name = clean_name where community_id = cid and kind = 'main';
  end if;
end;
$$;
revoke execute on function public.update_community_settings(uuid, text, jsonb) from public, anon;
grant execute on function public.update_community_settings(uuid, text, jsonb) to authenticated;

-- 5f. Sub-groups: admins and committee create, rename and archive them and
--     choose who's in them (they may add themselves, which everyone in the
--     group sees).

create or replace function public.create_community_group(cid uuid, group_name text, group_description text default '')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  clean_name text := btrim(coalesce(group_name, ''));
  clean_description text := btrim(coalesce(group_description, ''));
  gid uuid;
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform 1 from public.communities c where c.id = cid for update;
  if not found then raise exception 'Community not found'; end if;
  if not public.is_motive_admin() and coalesce(public.community_role_of(cid, uid), '') not in ('admin', 'committee') then
    raise exception 'Only the community''s admins and committee can do that';
  end if;
  if char_length(clean_name) not between 1 and 80 then raise exception 'Group names must be 1 to 80 characters'; end if;
  if char_length(clean_description) > 500 then raise exception 'The description can be up to 500 characters'; end if;
  if exists (select 1 from public.community_groups g where g.community_id = cid and g.archived_at is null and lower(g.name) = lower(clean_name)) then
    raise exception 'There''s already a group called that';
  end if;
  insert into public.community_groups (community_id, name, description, kind, sort, created_by)
  values (cid, clean_name, clean_description, 'sub',
          coalesce((select max(g.sort) from public.community_groups g where g.community_id = cid), 0) + 1, uid)
  returning id into gid;
  return gid;
end;
$$;
revoke execute on function public.create_community_group(uuid, text, text) from public, anon;
grant execute on function public.create_community_group(uuid, text, text) to authenticated;

-- The group a manager is changing, checked and locked. Server only.
create or replace function public.community_group_for_manager(gid uuid)
returns public.community_groups
language plpgsql security definer set search_path = ''
as $$
declare
  g public.community_groups;
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  select * into g from public.community_groups x where x.id = gid;
  if not found then raise exception 'Group not found'; end if;
  perform 1 from public.communities c where c.id = g.community_id for update;
  if not public.is_motive_admin() and coalesce(public.community_role_of(g.community_id, auth.uid()), '') not in ('admin', 'committee') then
    raise exception 'Only the community''s admins and committee can do that';
  end if;
  if g.kind <> 'sub' then raise exception 'That can''t be done to the main group'; end if;
  if g.archived_at is not null then raise exception 'This group is archived'; end if;
  return g;
end;
$$;
revoke execute on function public.community_group_for_manager(uuid) from public, anon, authenticated;

create or replace function public.rename_community_group(gid uuid, group_name text, group_description text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g public.community_groups := public.community_group_for_manager(gid);
  clean_name text := btrim(coalesce(group_name, ''));
  clean_description text := btrim(coalesce(group_description, g.description));
begin
  if char_length(clean_name) not between 1 and 80 then raise exception 'Group names must be 1 to 80 characters'; end if;
  if char_length(clean_description) > 500 then raise exception 'The description can be up to 500 characters'; end if;
  if exists (select 1 from public.community_groups x where x.community_id = g.community_id and x.id <> gid
             and x.archived_at is null and lower(x.name) = lower(clean_name)) then
    raise exception 'There''s already a group called that';
  end if;
  update public.community_groups set name = clean_name, description = clean_description where id = gid;
end;
$$;
revoke execute on function public.rename_community_group(uuid, text, text) from public, anon;
grant execute on function public.rename_community_group(uuid, text, text) to authenticated;

-- Archiving hides the group and its chat from everyone (nothing is deleted).
create or replace function public.archive_community_group(gid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g public.community_groups := public.community_group_for_manager(gid);
begin
  update public.community_groups set archived_at = now() where id = g.id;
end;
$$;
revoke execute on function public.archive_community_group(uuid) from public, anon;
grant execute on function public.archive_community_group(uuid) to authenticated;

create or replace function public.add_group_member(gid uuid, target uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g public.community_groups := public.community_group_for_manager(gid);
  nick text;
  tid uuid := public.community_group_thread(gid);
begin
  select m.nickname into nick from public.community_members m
  where m.community_id = g.community_id and m.user_id = target and m.status = 'active' for update;
  if not found then raise exception 'They''re not an active member of this community'; end if;
  insert into public.community_group_members (group_id, user_id, added_by) values (gid, target, uid) on conflict do nothing;
  if not found then return; end if;
  if target = uid then
    insert into public.messages (thread_id, sender_id, body, kind) values (tid, uid, 'joined the group', 'joined');
  else
    insert into public.messages (thread_id, sender_id, body, kind, subject_user_id) values (tid, uid, left('added ' || nick, 2000), 'added', target);
  end if;
  update public.threads set last_message_at = now() where id = tid;
end;
$$;
revoke execute on function public.add_group_member(uuid, uuid) from public, anon;
grant execute on function public.add_group_member(uuid, uuid) to authenticated;

create or replace function public.remove_group_member(gid uuid, target uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g public.community_groups := public.community_group_for_manager(gid);
  nick text;
  tid uuid := public.community_group_thread(gid);
begin
  select m.nickname into nick from public.community_members m where m.community_id = g.community_id and m.user_id = target;
  delete from public.community_group_members where group_id = gid and user_id = target;
  if not found then return; end if;
  if target = uid then
    insert into public.messages (thread_id, sender_id, body, kind) values (tid, uid, 'left the group', 'left');
  else
    insert into public.messages (thread_id, sender_id, body, kind, subject_user_id)
    values (tid, uid, left('removed ' || coalesce(nick, 'someone') || ' from the group', 2000), 'removed', target);
  end if;
  update public.threads set last_message_at = now() where id = tid;
end;
$$;
revoke execute on function public.remove_group_member(uuid, uuid) from public, anon;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;

-- 5g. The Function team: create a community (with its main group and its
--     chat) and set its first admins.

create or replace function public.admin_create_community(community_name text, community_slug text, society uuid default null, community_bio text default '')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  clean_slug text := lower(btrim(coalesce(community_slug, '')));
  clean_name text := btrim(coalesce(community_name, ''));
  clean_bio text := btrim(coalesce(community_bio, ''));
  cid uuid;
begin
  if not public.is_motive_admin() then raise exception 'Only the Function team can do this'; end if;
  if char_length(clean_name) not between 1 and 80 then raise exception 'The name must be 1 to 80 characters'; end if;
  if char_length(clean_slug) not between 3 and 60 or clean_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'The web address must be 3 to 60 lowercase letters, numbers and single hyphens';
  end if;
  if char_length(clean_bio) > 1000 then raise exception 'The bio can be up to 1,000 characters'; end if;
  if society is not null and not exists (select 1 from public.societies s where s.id = society) then raise exception 'Society not found'; end if;
  if exists (select 1 from public.communities c where c.slug = clean_slug) then raise exception 'That web address is taken'; end if;
  insert into public.communities (slug, name, bio, society_id, created_by)
  values (clean_slug, clean_name, clean_bio, society, auth.uid())
  returning id into cid;
  return cid;
exception when unique_violation then
  raise exception 'That web address is taken';
end;
$$;
revoke execute on function public.admin_create_community(text, text, uuid, text) from public, anon;
grant execute on function public.admin_create_community(text, text, uuid, text) to authenticated;

-- Make someone an admin (adding them as an active member first if needed).
create or replace function public.admin_set_community_admin(cid uuid, target uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mem record;
begin
  if not public.is_motive_admin() then raise exception 'Only the Function team can do this'; end if;
  perform 1 from public.communities c where c.id = cid for update;
  if not found then raise exception 'Community not found'; end if;
  if not exists (select 1 from public.profiles p where p.id = target) then raise exception 'Person not found'; end if;
  select * into mem from public.community_members m where m.community_id = cid and m.user_id = target for update;
  if not found then
    insert into public.community_members (community_id, user_id, nickname, role, status, decided_by, decided_at)
    values (cid, target, public.community_default_nickname(cid, target), 'admin', 'active', uid, now());
  elsif mem.status in ('pending', 'active') then
    update public.community_members set role = 'admin', status = 'active',
      decided_by = case when mem.status = 'pending' then uid else decided_by end,
      decided_at = case when mem.status = 'pending' then now() else decided_at end
    where community_id = cid and user_id = target;
  else
    -- Left, declined or removed before: back in, as an admin, with a free nickname.
    update public.community_members set role = 'admin', status = 'active', decided_by = uid, decided_at = now(),
      nickname = case when public.community_nickname_taken(cid, mem.nickname, target) then public.community_default_nickname(cid, target) else mem.nickname end
    where community_id = cid and user_id = target;
  end if;
end;
$$;
revoke execute on function public.admin_set_community_admin(uuid, uuid) from public, anon;
grant execute on function public.admin_set_community_admin(uuid, uuid) to authenticated;

create or replace function public.admin_list_communities()
returns table (id uuid, slug text, name text, society_id uuid, society_name text, active_members bigint,
               pending_requests bigint, admins bigint, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.slug, c.name, c.society_id, s.name,
         (select count(*) from public.community_members m where m.community_id = c.id and m.status = 'active'),
         (select count(*) from public.community_members m where m.community_id = c.id and m.status = 'pending'),
         (select count(*) from public.community_members m where m.community_id = c.id and m.status = 'active' and m.role = 'admin'),
         c.created_at
  from public.communities c left join public.societies s on s.id = c.society_id
  where public.is_motive_admin()
  order by c.created_at;
$$;
revoke execute on function public.admin_list_communities() from public, anon;
grant execute on function public.admin_list_communities() to authenticated;

-- ---------------------------------------------------------------------
-- 6. Sending notifications at scale (see supabase/functions/send-push)
-- ---------------------------------------------------------------------

-- How many times send-push has taken each notification. A notification
-- whose sending failed is retried on the next run, up to 3 times.
alter table public.push_queue add column if not exists attempts integer not null default 0;
create index if not exists push_queue_sent_idx on public.push_queue (sent_at) where sent_at is not null;

-- 20261201000000_instant_push.sql: up to 1,000 at a time (a message to a
-- big community chat queues one per person), counting the attempts, and
-- never a notification that has already been tried 5 times.
create or replace function public.claim_push_batch(batch integer default 200)
returns table (id bigint, user_id uuid, kind text, title text, body text, url text)
language sql volatile security definer set search_path = ''
as $$
  update public.push_queue q
  set claimed_at = now(), attempts = q.attempts + 1
  where q.id in (
    select p.id from public.push_queue p
    where p.sent_at is null and (p.claimed_at is null or p.claimed_at < now() - interval '2 minutes')
      and p.attempts < 5
    order by p.created_at
    limit greatest(1, least(coalesce(batch, 200), 1000))
    for update skip locked
  )
  returning q.id, q.user_id, q.kind, q.title, q.body, q.url;
$$;
revoke execute on function public.claim_push_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_push_batch(integer) to service_role;

-- Tidy away notifications sent more than a week ago (and any that were
-- never sent and are now a week old), a few thousand at a time. send-push
-- calls this at the end of every run; it's quick when there's nothing to do.
create or replace function public.purge_push_queue(keep_days integer default 7)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  cutoff timestamptz := now() - make_interval(days => greatest(coalesce(keep_days, 7), 1));
  gone integer;
begin
  delete from public.push_queue q
  where q.id in (
    (select p.id from public.push_queue p where p.sent_at is not null and p.sent_at < cutoff limit 5000)
    union all
    (select p.id from public.push_queue p where p.sent_at is null and p.created_at < cutoff limit 5000)
  );
  get diagnostics gone = row_count;
  return gone;
end;
$$;
revoke execute on function public.purge_push_queue(integer) from public, anon, authenticated;
grant execute on function public.purge_push_queue(integer) to service_role;

-- ---------------------------------------------------------------------
-- 7. Muting a chat (any kind): 1 hour, 8 hours, 1 week, always, or off.
--    Muted chats send no notifications but still count unread.
-- ---------------------------------------------------------------------
create or replace function public.set_thread_mute(tid uuid, duration text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  until_at timestamptz;
begin
  if uid is null then raise exception 'Log in first'; end if;
  if duration is null or duration not in ('1h', '8h', '1w', 'always', 'off') then
    raise exception 'Choose 1 hour, 8 hours, 1 week, always or off';
  end if;
  if not public.can_use_thread(tid) then raise exception 'Chat not found'; end if;
  if duration = 'off' then
    delete from public.thread_mutes where thread_id = tid and user_id = uid;
    return;
  end if;
  until_at := case duration when '1h' then now() + interval '1 hour'
                            when '8h' then now() + interval '8 hours'
                            when '1w' then now() + interval '7 days' end;
  insert into public.thread_mutes (thread_id, user_id, muted_until) values (tid, uid, until_at)
  on conflict (thread_id, user_id) do update set muted_until = excluded.muted_until, created_at = now();
end;
$$;
revoke execute on function public.set_thread_mute(uuid, text) from public, anon;
grant execute on function public.set_thread_mute(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Community pictures and banners: in the public images bucket under
--    communities/<community id>/, uploaded by its admins and committee
--    (and the Function team).
-- ---------------------------------------------------------------------
create or replace function public.can_manage_community_image(object_name text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  folders text[] := storage.foldername(object_name);
  cid uuid;
begin
  if folders is null or array_length(folders, 1) is distinct from 2 or folders[1] <> 'communities' then return false; end if;
  if folders[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  cid := folders[2]::uuid;
  return public.is_motive_admin() or public.is_community_manager(cid);
end;
$$;
revoke execute on function public.can_manage_community_image(text) from public, anon;
grant execute on function public.can_manage_community_image(text) to authenticated;

drop policy if exists images_insert_community on storage.objects;
create policy images_insert_community on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and public.can_manage_community_image(name));
drop policy if exists images_update_community on storage.objects;
create policy images_update_community on storage.objects for update to authenticated
  using (bucket_id = 'images' and public.can_manage_community_image(name))
  with check (bucket_id = 'images' and public.can_manage_community_image(name));
drop policy if exists images_delete_community on storage.objects;
create policy images_delete_community on storage.objects for delete to authenticated
  using (bucket_id = 'images' and public.can_manage_community_image(name));

-- ---------------------------------------------------------------------
-- 10. UCL Abacus: linked to the UCL ABACUS society if there is one, with
--     its main group (made by the trigger above) and AbaFam, each with
--     its chat. No members yet: the Function team sets the first admins.
-- ---------------------------------------------------------------------
insert into public.communities (slug, name, bio, society_id)
select 'ucl-abacus', 'UCL Abacus', '',
       (select s.id from public.societies s
        where lower(btrim(s.name)) = 'ucl abacus'
        order by (s.university = 'UCL') desc,
                 exists (select 1 from public.society_admins a where a.society_id = s.id) desc,
                 s.created_at
        limit 1)
on conflict (slug) do nothing;

insert into public.community_groups (community_id, name, kind, sort)
select c.id, 'AbaFam', 'sub', 1 from public.communities c
where c.slug = 'ucl-abacus'
  and not exists (select 1 from public.community_groups g where g.community_id = c.id and g.kind = 'sub' and lower(g.name) = 'abafam');
