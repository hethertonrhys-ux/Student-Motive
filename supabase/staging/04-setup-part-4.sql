-- =====================================================================
-- Function TEST database setup, part 4 of 4. Paste into the SQL Editor
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
-- see "Success. No rows returned". Then do 90-test-accounts.sql (the test accounts).
--
-- If a red error appears instead, nothing has been changed (each part
-- runs all or nothing). Take a screenshot, send it, and don't change
-- anything in this file.
--
-- This part contains these files from the app's code, unchanged, in order
-- (files 43 to 50 of 50):
--   43. 20261124000000_leave_group_chat.sql
--   44. 20261125000000_share_events_in_chats.sql
--   45. 20261126000000_chat_photos_videos.sql
--   46. 20261127000000_chat_pins_admins.sql
--   47. 20261128000000_reporting_blocking.sql
--   48. 20261129000000_split_payments.sql
--   49. 20261201000000_instant_push.sql
--   50. seed.sql
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
  -- 3. Only the test project has the marker that part 1 adds at its end.
  if to_regclass('public.allowed_emails') is null then
    raise exception 'STOP: this is not the test project (part 1 of these files was never run here). Nothing was changed. Check the web address contains pvldkzjrrhcnwctveemu: if it does, part 1 was skipped, so run part 1 first; if it does not, stop, you are in the wrong project.';
  end if;
  if not exists (select 1 from public.allowed_emails where email = '@staging.studentfunction.com') then
    raise exception 'STOP: this is not the test project (part 1 of these files was never run here). Nothing was changed. Check the web address contains pvldkzjrrhcnwctveemu: if it does, part 1 was skipped, so run part 1 first; if it does not, stop, you are in the wrong project.';
  end if;
  -- 4. Part 3 must have been run first (it makes society_features).
  if to_regclass('public.society_features') is null then
    raise exception 'STOP: part 3 has not been run here yet, so nothing was changed. Run the parts in order: part 3 first.';
  end if;
  -- 5. This part makes thread_leaves, so if it's already here this part has run.
  if to_regclass('public.thread_leaves') is not null then
    raise exception 'STOP: part 4 has already been run here, so nothing was changed. Only if your browser address contains pvldkzjrrhcnwctveemu, go on to 90-test-accounts.sql; otherwise stop, you are in the wrong project.';
  end if;
end $$;

-- ===== 20261124000000_leave_group_chat.sql =====
-- Leaving a group chat.
--
-- Group chats are the event chats: a society event's chat and a Social
-- plan's chat. Who's in one isn't stored; it's whoever is hosting, going
-- or (for a society event) on the committee. So leaving is stored as its
-- own row, and the chat rules skip anyone who has left:
--
--   1. thread_leaves: who left which group chat, and when. You can read
--      your own rows; nobody writes them directly (leave_thread and
--      rejoin_thread do).
--   2. messages.kind: 'message' (what people write) or a note the app
--      shows in small grey text: 'left' ("Rhys left") or 'rejoined'
--      ("Rhys rejoined"). The note's body is "left the group" /
--      "rejoined the group", so app builds and websites that don't know
--      about notes still show something sensible.
--   3. can_use_thread (reading, sending, the Chats list and unread counts)
--      now also needs you not to have left. thread_member is the old rule
--      (who belongs in the chat), used for seeing that the chat exists, so
--      the event page's "Open group chat" still finds it and can offer
--      "Rejoin".
--   4. leave_thread(tid) / rejoin_thread(tid). Group chats only: a private
--      chat can't be left. Leaving never touches your place at the event.
--   5. Pushes: notes don't send one, and people who left get none.
--   6. Notes don't count as unread.
--
-- Safe to run twice.

-- 1. Who left which chat.
create table if not exists public.thread_leaves (
  thread_id uuid not null references public.threads (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  left_at   timestamptz not null default now(),
  primary key (thread_id, user_id)
);
alter table public.thread_leaves enable row level security;
drop policy if exists thread_leaves_select_own on public.thread_leaves;
create policy thread_leaves_select_own on public.thread_leaves for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.thread_leaves from anon, authenticated;

-- 2. Notes in the chat.
alter table public.messages add column if not exists kind text not null default 'message';
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('message', 'left', 'rejoined'));

-- 3. Who belongs in a chat (the rule can_use_thread had until now,
--    20261121000000_event_admin.sql), and who can use it.
create or replace function public.thread_member(tid uuid)
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
revoke execute on function public.thread_member(uuid) from public, anon;
grant execute on function public.thread_member(uuid) to authenticated;

create or replace function public.can_use_thread(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.thread_member(tid)
     and not exists (select 1 from public.thread_leaves l where l.thread_id = tid and l.user_id = (select auth.uid()));
$$;

-- Seeing that a chat exists (its id and which event it's for): still
-- everyone who belongs in it, so a person who left can find it to rejoin.
-- Its messages stay hidden from them (messages_select uses can_use_thread).
drop policy if exists threads_select on public.threads;
create policy threads_select on public.threads for select to authenticated
  using (public.thread_member(id) or public.is_motive_admin());

-- 4. Leaving and rejoining.
create or replace function public.leave_thread(tid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  t record;
begin
  if uid is null then raise exception 'Log in first'; end if;
  select * into t from public.threads where id = tid;
  if t is null or not public.thread_member(tid) then raise exception 'Chat not found'; end if;
  if t.event_id is null and t.social_event_id is null then raise exception 'You can only leave group chats'; end if;
  -- Already left: nothing to do (no second note).
  if exists (select 1 from public.thread_leaves where thread_id = tid and user_id = uid) then return; end if;
  insert into public.thread_leaves (thread_id, user_id) values (tid, uid);
  insert into public.messages (thread_id, sender_id, body, kind) values (tid, uid, 'left the group', 'left');
  update public.threads set last_message_at = now() where id = tid;
end;
$$;
revoke execute on function public.leave_thread(uuid) from public, anon;
grant execute on function public.leave_thread(uuid) to authenticated;

create or replace function public.rejoin_thread(tid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Log in first'; end if;
  if not public.thread_member(tid) then raise exception 'Only people going can join this chat'; end if;
  delete from public.thread_leaves where thread_id = tid and user_id = uid;
  if not found then return; end if;
  insert into public.messages (thread_id, sender_id, body, kind) values (tid, uid, 'rejoined the group', 'rejoined');
  update public.threads set last_message_at = now() where id = tid;
  -- Messages from while you were away aren't counted as unread.
  insert into public.thread_reads (thread_id, user_id, last_read_at) values (tid, uid, now())
  on conflict (thread_id, user_id) do update set last_read_at = now();
end;
$$;
revoke execute on function public.rejoin_thread(uuid) from public, anon;
grant execute on function public.rejoin_thread(uuid) to authenticated;

-- 5. Pushes (20261121000000_event_admin.sql, plus: no push for a note, and
--    none to people who left the chat).
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
  if new.sender_id is null or new.kind <> 'message' then return new; end if;
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
        and not exists (select 1 from public.thread_leaves l where l.thread_id = t.id and l.user_id = x.u)
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
    loop
      perform public.queue_push(r, 'messages', who || ' in ' || (select title from public.social_events where id = t.social_event_id), preview, '/chats/' || t.id);
    end loop;
  end if;
  return new;
end;
$$;

-- 6. The chat list (20261121000000_event_admin.sql, plus: notes don't
--    count as unread). Chats you left drop out through can_use_thread.
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
            and m.kind = 'message'
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

-- ===== 20261125000000_share_events_in_chats.sql =====
-- Sharing events into chats.
--
-- Anyone in a chat can send an event into it (a society event or a Social
-- plan); it shows as a card that opens the event. Builds on
-- 20261124000000_leave_group_chat.sql (run that first).
--
--   1. messages.event_id / social_event_id, and a new message kind 'event'.
--   2. threads.members_can_share_events (on by default): a group chat's
--      admins can switch it off, and then only they can share events there.
--      Private chats ignore it.
--   3. is_thread_admin(tid): who runs a group chat. For now that's the
--      event's student host or its society's committee, or the Social
--      plan's host.
--   4. Sending: the app inserts the message itself, and the database only
--      accepts it when you're in the chat, you're allowed to share there,
--      and YOU can see the event (the events' own visibility rules are
--      checked as you, so a friends-only plan, a draft or a hidden event
--      can't be shared by someone who can't see it). Cancelled events and
--      drafts can't be shared. The server fills in the text and time.
--   5. Seeing the card: each person's app loads the event with their own
--      visibility, so the card never shows more than they could already
--      see, and joining goes through the event's normal join or request
--      (the host's approval and the spaces left still apply).
--   6. Pushes and unread counts treat a shared event like a message; only
--      the "left"/"rejoined" notes are left out.
--
-- Safe to run twice.

-- 1. Shared events in messages.
alter table public.messages add column if not exists event_id uuid references public.events (id) on delete set null;
alter table public.messages add column if not exists social_event_id uuid references public.social_events (id) on delete set null;
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('message', 'left', 'rejoined', 'event'));

-- 2. The group chat setting.
alter table public.threads add column if not exists members_can_share_events boolean not null default true;

-- 3. Who runs a group chat.
create or replace function public.is_thread_admin(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.threads t
    where t.id = tid and (
      (t.event_id is not null and (
         public.is_event_host(t.event_id)
         or exists (select 1 from public.events e where e.id = t.event_id and e.society_id is not null and public.is_society_committee(e.society_id))))
      or (t.social_event_id is not null and public.social_is_host(t.social_event_id))
    )
  );
$$;
revoke execute on function public.is_thread_admin(uuid) from public, anon;
grant execute on function public.is_thread_admin(uuid) to authenticated;

-- May the logged-in person share events in this chat? (Being in the chat is
-- checked separately.)
create or replace function public.may_share_events(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.threads t
    where t.id = tid and (
      (t.event_id is null and t.social_event_id is null)
      or t.members_can_share_events
      or public.is_thread_admin(tid)
    )
  );
$$;
revoke execute on function public.may_share_events(uuid) from public, anon;
grant execute on function public.may_share_events(uuid) to authenticated;

-- Admins switch sharing on or off.
create or replace function public.set_members_can_share_events(tid uuid, allowed boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  if not public.can_use_thread(tid) or not public.is_thread_admin(tid) then
    raise exception 'Only the chat''s admins can change this';
  end if;
  update public.threads set members_can_share_events = allowed where id = tid;
end;
$$;
revoke execute on function public.set_members_can_share_events(uuid, boolean) from public, anon;
grant execute on function public.set_members_can_share_events(uuid, boolean) to authenticated;

-- 4. Sending a shared event. Only event messages can be inserted directly;
--    everything else still goes through send_message().
drop policy if exists messages_insert_shared_event on public.messages;
create policy messages_insert_shared_event on public.messages for insert to authenticated
  with check (
    kind = 'event'
    and sender_id = (select auth.uid())
    and deleted_at is null
    and public.can_use_thread(thread_id)
    and public.may_share_events(thread_id)
    and (
      (event_id is not null and social_event_id is null
        -- Checked with the sharer's own rights: events they can't see don't exist here.
        and exists (select 1 from public.events e where e.id = event_id and not e.is_cancelled and not coalesce(e.is_draft, false)))
      or (social_event_id is not null and event_id is null
        and exists (select 1 from public.social_events s where s.id = social_event_id and not s.is_cancelled))
    )
  );
grant insert on public.messages to authenticated;

-- The server writes the text (shown by app versions without cards) and the time.
create or replace function public.fill_shared_event_message()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  title text;
begin
  if new.kind <> 'event' then return new; end if;
  if new.event_id is not null then
    select e.title into title from public.events e where e.id = new.event_id;
    new.body := left('Shared an event: ' || coalesce(title, 'an event') || ' https://studentfunction.com/e/' || new.event_id, 2000);
  else
    select s.title into title from public.social_events s where s.id = new.social_event_id;
    new.body := left('Shared an event: ' || coalesce(title, 'an event') || ' https://studentfunction.com/social/' || new.social_event_id, 2000);
  end if;
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists messages_fill_shared_event on public.messages;
create trigger messages_fill_shared_event before insert on public.messages
  for each row execute function public.fill_shared_event_message();

-- Like send_message: the chat moves to the top, and it's read for the sender.
create or replace function public.after_shared_event_message()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.kind <> 'event' then return new; end if;
  update public.threads set last_message_at = now() where id = new.thread_id;
  insert into public.thread_reads (thread_id, user_id, last_read_at) values (new.thread_id, new.sender_id, now())
  on conflict (thread_id, user_id) do update set last_read_at = now();
  return new;
end;
$$;
drop trigger if exists messages_after_shared_event on public.messages;
create trigger messages_after_shared_event after insert on public.messages
  for each row execute function public.after_shared_event_message();

-- Not callable by anyone using the app (they're triggers).
revoke execute on function public.fill_shared_event_message() from public, anon, authenticated;
revoke execute on function public.after_shared_event_message() from public, anon, authenticated;

-- 6. Pushes (20261124000000_leave_group_chat.sql, but only the notes are
--    skipped, so a shared event sends one like a message does).
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
  if new.sender_id is null or new.kind in ('left', 'rejoined') then return new; end if;
  if new.kind = 'event' then preview := left(regexp_replace(preview, ' https://\S+$', ''), 100); end if;
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
        and not exists (select 1 from public.thread_leaves l where l.thread_id = t.id and l.user_id = x.u)
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
    loop
      perform public.queue_push(r, 'messages', who || ' in ' || (select title from public.social_events where id = t.social_event_id), preview, '/chats/' || t.id);
    end loop;
  end if;
  return new;
end;
$$;

-- Unread counts: everything except the notes (20261124000000_leave_group_chat.sql
-- counted only 'message').
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
            and m.kind not in ('left', 'rejoined')
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

-- ===== 20261126000000_chat_photos_videos.sql =====
-- Photos and videos in chats.
--
-- Builds on 20261125000000_share_events_in_chats.sql (run that first).
--
--   1. A private storage bucket, chat-media, for the files. Each file lives
--      at <chat id>/<sender id>/<random name>. Only people who can use the
--      chat can see its files (the app asks for a link that expires after
--      an hour), and you can only upload into a chat you're in, under your
--      own name. 50 MB per file at most; photos (JPEG, PNG, WebP, HEIC) and
--      videos (MP4, MOV, WebM) only.
--   2. messages.media_path (and its size and length), and two new message
--      kinds, 'photo' and 'video'.
--   3. send_media(): posts the photo or video once it's uploaded. It checks
--      you're in the chat and that the file is yours, in that chat, and
--      really there. The text ("Sent a photo") is what older app versions
--      and notifications show.
--   4. Deleting a message also forgets its photo or video, so nobody can
--      open it afterwards.
--
-- Safe to run twice.

-- 1. The bucket and who can use it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The chat a file belongs to (its first folder), or null if the name isn't one of ours.
create or replace function public.chat_media_thread(object_name text)
returns uuid
language plpgsql immutable set search_path = ''
as $$
declare
  first text := split_part(object_name, '/', 1);
begin
  if first ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return first::uuid; end if;
  return null;
end;
$$;
grant execute on function public.chat_media_thread(text) to authenticated;

drop policy if exists chat_media_select on storage.objects;
create policy chat_media_select on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and public.can_use_thread(public.chat_media_thread(name)));

drop policy if exists chat_media_insert on storage.objects;
create policy chat_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and split_part(name, '/', 2) = (select auth.uid())::text
    and public.can_use_thread(public.chat_media_thread(name))
  );

-- 2. Photos and videos in messages.
alter table public.messages add column if not exists media_path text;
alter table public.messages add column if not exists media_width integer;
alter table public.messages add column if not exists media_height integer;
alter table public.messages add column if not exists media_duration_ms integer;
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('message', 'left', 'rejoined', 'event', 'photo', 'video'));

-- 3. Posting it.
create or replace function public.send_media(tid uuid, media_kind text, path text, width integer, height integer, duration_ms integer)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mid uuid;
begin
  if uid is null then raise exception 'Log in first'; end if;
  if media_kind not in ('photo', 'video') then raise exception 'Send a photo or a video'; end if;
  if not public.can_use_thread(tid) then raise exception 'You can''t send messages here'; end if;
  if path is null or split_part(path, '/', 1) <> tid::text or split_part(path, '/', 2) <> uid::text or split_part(path, '/', 3) = '' or split_part(path, '/', 4) <> '' then
    raise exception 'That file isn''t yours';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'chat-media' and o.name = path) then
    raise exception 'The upload didn''t finish. Try again.';
  end if;
  insert into public.messages (thread_id, sender_id, body, kind, media_path, media_width, media_height, media_duration_ms)
  values (tid, uid, case when media_kind = 'photo' then 'Sent a photo' else 'Sent a video' end, media_kind, path,
          nullif(greatest(width, 0), 0), nullif(greatest(height, 0), 0), nullif(greatest(duration_ms, 0), 0))
  returning id into mid;
  update public.threads set last_message_at = now() where id = tid;
  insert into public.thread_reads (thread_id, user_id, last_read_at) values (tid, uid, now())
  on conflict (thread_id, user_id) do update set last_read_at = now();
  return mid;
end;
$$;
revoke execute on function public.send_media(uuid, text, text, integer, integer, integer) from public, anon;
grant execute on function public.send_media(uuid, text, text, integer, integer, integer) to authenticated;

-- 4. Deleting a message (20261020000000_social.sql) also forgets its photo or video.
create or replace function public.delete_message(mid uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.messages set deleted_at = now(), body = '(deleted)', media_path = null
  where id = mid and (sender_id = (select auth.uid()) or public.is_motive_admin());
$$;

-- ===== 20261127000000_chat_pins_admins.sql =====
-- Pinned messages and group chat admins.
--
-- Builds on 20261126000000_chat_photos_videos.sql (run that first).
--
--   1. Admins. A group chat's organisers are always its admins: the event's
--      student host and its society's committee, or the Social plan's host.
--      Admins can make other people in the chat admins too (thread_admins).
--      Organisers can't be demoted or removed. A chat is never left without
--      an admin: the last admin can't step down or leave.
--   2. Removing someone: an admin takes them out of the group chat (not out
--      of the event). It's stored like leaving (thread_leaves.removed_by),
--      so the chat disappears from their list and they get no more of its
--      messages or pushes. They can't rejoin by themselves; an admin can add
--      them back. Everyone sees "Sam removed Rhys".
--   3. The member list: thread_members(tid), names and photos only (never
--      emails), for people in the chat; admins also see who was removed.
--   4. Pinning: one pinned message per chat (threads.pinned_message_id).
--      Group chats: admins pin and unpin. Private chats: either person.
--      Pinning another message replaces it for everyone; deleting the
--      pinned message unpins it.
--
-- Safe to run twice.

-- 1. Explicit admins.
create table if not exists public.thread_admins (
  thread_id uuid not null references public.threads (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  added_by  uuid references public.profiles (id) on delete set null,
  added_at  timestamptz not null default now(),
  primary key (thread_id, user_id)
);
alter table public.thread_admins enable row level security;
-- Read through thread_members(); written only by the functions below.
revoke all on public.thread_admins from anon, authenticated;

-- 2. Removals are a kind of leaving.
alter table public.thread_leaves add column if not exists removed_by uuid references public.profiles (id) on delete set null;
alter table public.messages add column if not exists subject_user_id uuid references public.profiles (id) on delete set null;
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('message', 'left', 'rejoined', 'event', 'photo', 'video', 'removed'));

-- 4. The pinned message.
alter table public.threads add column if not exists pinned_message_id uuid references public.messages (id) on delete set null;
alter table public.threads add column if not exists pinned_by uuid references public.profiles (id) on delete set null;
alter table public.threads add column if not exists pinned_at timestamptz;

-- Is this person in this group chat (going, hosting or on the committee),
-- whether or not they left it? (thread_member is the same for whoever is
-- logged in.)
create or replace function public.thread_member_of(tid uuid, uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.threads t
    where t.id = tid and (
      (t.event_id is not null and (
         exists (select 1 from public.events e where e.id = t.event_id and e.host_user_id = uid)
         or exists (select 1 from public.event_entries en join public.events e on e.id = en.event_id
                    where en.event_id = t.event_id and en.user_id = uid and en.status = 'going' and not coalesce(e.is_draft, false))
         or exists (select 1 from public.events e join public.society_admins a on a.society_id = e.society_id where e.id = t.event_id and a.user_id = uid)))
      or (t.social_event_id is not null and (
         exists (select 1 from public.social_events s where s.id = t.social_event_id and s.host_id = uid)
         or exists (select 1 from public.social_event_members m where m.event_id = t.social_event_id and m.user_id = uid and m.status = 'going')))
    )
  );
$$;
revoke execute on function public.thread_member_of(uuid, uuid) from public, anon, authenticated;

-- The organisers: always admins.
create or replace function public.thread_organiser(tid uuid, uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.threads t
    where t.id = tid and (
      (t.event_id is not null and (
         exists (select 1 from public.events e where e.id = t.event_id and e.host_user_id = uid)
         or exists (select 1 from public.events e join public.society_admins a on a.society_id = e.society_id where e.id = t.event_id and a.user_id = uid)))
      or (t.social_event_id is not null and exists (select 1 from public.social_events s where s.id = t.social_event_id and s.host_id = uid))
    )
  );
$$;
revoke execute on function public.thread_organiser(uuid, uuid) from public, anon, authenticated;

-- Is this person an admin of this group chat (organiser, or made admin while still in it)?
create or replace function public.thread_admin_of(tid uuid, uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.thread_organiser(tid, uid)
      or (exists (select 1 from public.thread_admins a where a.thread_id = tid and a.user_id = uid)
          and public.thread_member_of(tid, uid));
$$;
revoke execute on function public.thread_admin_of(uuid, uuid) from public, anon, authenticated;

-- 20261125000000_share_events_in_chats.sql: now also the admins made admin.
create or replace function public.is_thread_admin(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
     and exists (select 1 from public.threads t where t.id = tid and (t.event_id is not null or t.social_event_id is not null))
     and public.thread_admin_of(tid, (select auth.uid()));
$$;

-- Everyone who belongs in the chat right now (not left or removed), for the member list and the admin count.
create or replace function public.thread_people(tid uuid)
returns table (user_id uuid)
language sql stable security definer set search_path = ''
as $$
  select distinct u from (
    select e.host_user_id as u from public.threads t join public.events e on e.id = t.event_id where t.id = tid
    union select en.user_id from public.threads t join public.event_entries en on en.event_id = t.event_id
            join public.events e on e.id = t.event_id
          where t.id = tid and en.status = 'going' and not coalesce(e.is_draft, false)
    union select a.user_id from public.threads t join public.events e on e.id = t.event_id join public.society_admins a on a.society_id = e.society_id where t.id = tid
    union select s.host_id from public.threads t join public.social_events s on s.id = t.social_event_id where t.id = tid
    union select m.user_id from public.threads t join public.social_event_members m on m.event_id = t.social_event_id where t.id = tid and m.status = 'going'
  ) x
  where u is not null
    and not exists (select 1 from public.thread_leaves l where l.thread_id = tid and l.user_id = x.u);
$$;
revoke execute on function public.thread_people(uuid) from public, anon, authenticated;

create or replace function public.thread_admin_count(tid uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.thread_people(tid) p where public.thread_admin_of(tid, p.user_id);
$$;
revoke execute on function public.thread_admin_count(uuid) from public, anon, authenticated;

-- 3. The member list. Names and photos only.
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
  order by 7, 4 desc, 2;
$$;
revoke execute on function public.thread_members(uuid) from public, anon;
grant execute on function public.thread_members(uuid) to authenticated;

-- Making someone an admin, or not.
create or replace function public.set_thread_admin(tid uuid, uid uuid, make_admin boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
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
revoke execute on function public.set_thread_admin(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_thread_admin(uuid, uuid, boolean) to authenticated;

-- 2. Removing someone, and adding them back.
create or replace function public.remove_from_thread(tid uuid, uid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
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
revoke execute on function public.remove_from_thread(uuid, uuid) from public, anon;
grant execute on function public.remove_from_thread(uuid, uuid) to authenticated;

create or replace function public.add_back_to_thread(tid uuid, uid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  if not public.can_use_thread(tid) or not public.is_thread_admin(tid) then raise exception 'Only the chat''s admins can do that'; end if;
  delete from public.thread_leaves where thread_id = tid and user_id = uid and removed_by is not null;
end;
$$;
revoke execute on function public.add_back_to_thread(uuid, uuid) from public, anon;
grant execute on function public.add_back_to_thread(uuid, uuid) to authenticated;

-- 20261124000000_leave_group_chat.sql: the last admin can't leave.
create or replace function public.leave_thread(tid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  t record;
begin
  if uid is null then raise exception 'Log in first'; end if;
  select * into t from public.threads where id = tid;
  if t is null or not public.thread_member(tid) then raise exception 'Chat not found'; end if;
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

-- 20261124000000_leave_group_chat.sql: someone an admin removed can't rejoin by themselves.
create or replace function public.rejoin_thread(tid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Log in first'; end if;
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

-- 4. Pinning.
create or replace function public.may_pin(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.can_use_thread(tid)
     and exists (select 1 from public.threads t where t.id = tid
                 and ((t.event_id is null and t.social_event_id is null) or public.is_thread_admin(tid)));
$$;
revoke execute on function public.may_pin(uuid) from public, anon;
grant execute on function public.may_pin(uuid) to authenticated;

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
  if m.deleted_at is not null or m.kind in ('left', 'rejoined', 'removed') then raise exception 'That can''t be pinned'; end if;
  update public.threads set pinned_message_id = mid, pinned_by = auth.uid(), pinned_at = now() where id = m.thread_id;
end;
$$;
revoke execute on function public.pin_message(uuid) from public, anon;
grant execute on function public.pin_message(uuid) to authenticated;

create or replace function public.unpin_message(tid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  if not public.may_pin(tid) then raise exception 'Only the chat''s admins can unpin messages'; end if;
  update public.threads set pinned_message_id = null, pinned_by = null, pinned_at = null where id = tid;
end;
$$;
revoke execute on function public.unpin_message(uuid) from public, anon;
grant execute on function public.unpin_message(uuid) to authenticated;

-- 20261126000000_chat_photos_videos.sql: deleting the pinned message also unpins it.
create or replace function public.delete_message(mid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.messages set deleted_at = now(), body = '(deleted)', media_path = null
  where id = mid and (sender_id = (select auth.uid()) or public.is_motive_admin());
  if found then
    update public.threads set pinned_message_id = null, pinned_by = null, pinned_at = null where pinned_message_id = mid;
  end if;
end;
$$;

-- The "removed" note doesn't push and doesn't count as unread (as the other notes).
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
  if new.sender_id is null or new.kind in ('left', 'rejoined', 'removed') then return new; end if;
  if new.kind = 'event' then preview := left(regexp_replace(preview, ' https://\S+$', ''), 100); end if;
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
        and not exists (select 1 from public.thread_leaves l where l.thread_id = t.id and l.user_id = x.u)
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
    loop
      perform public.queue_push(r, 'messages', who || ' in ' || (select title from public.social_events where id = t.social_event_id), preview, '/chats/' || t.id);
    end loop;
  end if;
  return new;
end;
$$;

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
            and m.kind not in ('left', 'rejoined', 'removed')
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

-- ===== 20261128000000_reporting_blocking.sql =====
-- Reporting, blocking and removing content (safety, and an App Store
-- requirement for apps with things people post).
--
-- Builds on 20261127000000_chat_pins_admins.sql (run that first).
--
--   1. Reports. Messages (including photos, videos and shared events),
--      event listings, Social plans, profile photos and people can already
--      be reported (reports, social_reports, profile_photo_reports). Social
--      plan reports can now carry a note too.
--   2. Every new report is emailed to help@studentfunction.com: it's added
--      to email_queue here, and the send-email function (run every minute,
--      see RUN_ONCE_email_cron.sql) sends it with Resend. Nobody using the
--      app can read or write the queue.
--   3. Blocking works both ways, in the database:
--      - profile_cards hides each of you from the other, so neither can see
--        the other's profile or find them in search;
--      - in group chats neither sees the other's messages, isn't told about
--        them (pushes) and doesn't see them in the chat list's preview or
--        unread count;
--      (private chats already close: blocking unfriends you, and private
--      chats need friends). my_blocked_people() and unblock_user() are for
--      Settings → Privacy.
--   4. Bans: account_bans, set by Function admins only with
--      admin_set_ban(). A suspension (some days) or a ban (no end date)
--      stops the account logging in (Supabase Auth's banned_until) and logs
--      it out everywhere. admin_lift_ban() undoes it. Admins can't be banned
--      this way, and nobody can ban themselves.
--   5. Group chat admins (and Function admins) can delete messages in their
--      group chats. Function admins can open a reported chat photo or video.
--
-- Safe to run twice.

-- 1. A note on Social plan reports too, and reports can only be filed open.
alter table public.social_reports add column if not exists details text check (details is null or char_length(details) <= 2000);
drop policy if exists social_reports_insert on public.social_reports;
create policy social_reports_insert on public.social_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open');

-- 2. The email queue.
create table if not exists public.email_queue (
  id         bigserial primary key,
  to_address text not null,
  subject    text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  attempts   integer not null default 0,
  error      text
);
alter table public.email_queue enable row level security;
revoke all on public.email_queue from anon, authenticated;

create or replace function public.report_email_address()
returns text language sql immutable set search_path = '' as $$ select 'help@studentfunction.com' $$;

-- Who someone is, for the team (name, email and id).
create or replace function public.report_person(uid uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select coalesce(nullif(p.display_name, ''), 'Member') || coalesce(' <' || p.email || '>', '') || ' (id ' || p.id || ')' from public.profiles p where p.id = uid),
    'unknown (id ' || coalesce(uid::text, 'none') || ')');
$$;
revoke execute on function public.report_person(uuid) from public, anon, authenticated;

create or replace function public.queue_report_email(what text, reason text, details text, reporter uuid, subject_lines text, report_id text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.email_queue (to_address, subject, body)
  values (
    public.report_email_address(),
    left('[Function report] ' || what || ': ' || coalesce(reason, 'no reason'), 200),
    'A new report on Function. Please review it within 24 hours.' || chr(10) || chr(10)
      || 'What: ' || what || chr(10)
      || 'Reason: ' || coalesce(reason, '') || chr(10)
      || 'Note: ' || coalesce(nullif(details, ''), '(none)') || chr(10)
      || 'Reported by: ' || public.report_person(reporter) || chr(10)
      || 'When: ' || to_char(now() at time zone 'Europe/London', 'Dy DD Mon YYYY HH24:MI') || ' (London)' || chr(10) || chr(10)
      || subject_lines || chr(10) || chr(10)
      || 'Review and act on it in the admin panel: https://app.studentfunction.com/admin' || chr(10)
      || '(Report id ' || report_id || ')'
  );
end;
$$;
revoke execute on function public.queue_report_email(text, text, text, uuid, text, text) from public, anon, authenticated;

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
    select msg.*, t.event_id as t_event, t.social_event_id as t_social into m
      from public.messages msg join public.threads t on t.id = msg.thread_id where msg.id = new.message_id;
    what := case m.kind when 'photo' then 'a photo in a chat' when 'video' then 'a video in a chat' when 'event' then 'an event shared in a chat' else 'a chat message' end;
    lines := 'Sent by: ' || public.report_person(m.sender_id) || chr(10)
      || 'Content: ' || coalesce(m.body, '') || chr(10)
      || 'Chat: ' || case when m.t_event is not null or m.t_social is not null then 'a group chat' else 'a private chat' end || ' (id ' || m.thread_id || ')';
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
revoke execute on function public.email_on_report() from public, anon, authenticated;
drop trigger if exists reports_email on public.reports;
create trigger reports_email after insert on public.reports for each row execute function public.email_on_report();

create or replace function public.email_on_social_report()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  s record;
begin
  select se.title, se.host_id into s from public.social_events se where se.id = new.event_id;
  perform public.queue_report_email('a Social plan', new.reason, new.details, new.reporter_id,
    'Plan: ' || coalesce(s.title, '?') || ' — https://studentfunction.com/social/' || new.event_id || chr(10)
    || 'Hosted by: ' || public.report_person(s.host_id), new.id::text);
  return new;
end;
$$;
revoke execute on function public.email_on_social_report() from public, anon, authenticated;
drop trigger if exists social_reports_email on public.social_reports;
create trigger social_reports_email after insert on public.social_reports for each row execute function public.email_on_social_report();

create or replace function public.email_on_photo_report()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.queue_report_email('a profile photo', new.reason, null, new.reporter_id,
    'Photo of: ' || public.report_person((select p.user_id from public.profile_photos p where p.id = new.photo_id)) || chr(10)
    || 'Photo id: ' || new.photo_id, new.id::text);
  return new;
end;
$$;
revoke execute on function public.email_on_photo_report() from public, anon, authenticated;
drop trigger if exists profile_photo_reports_email on public.profile_photo_reports;
create trigger profile_photo_reports_email after insert on public.profile_photo_reports for each row execute function public.email_on_photo_report();

-- 3. Blocking, both ways.
-- profile_cards (20261111000000_profile_country.sql), without people either
-- of you has blocked.
create or replace view public.profile_cards as
  select id,
    coalesce(nullif(display_name, ''), 'Member') as name,
    avatar_url,
    course,
    bio,
    nullif(full_name, '') as full_name,
    nullif(nickname, '') as nickname,
    university,
    graduation_year,
    country
  from public.profiles
  -- (The Function team still see everyone, so reports keep their names.)
  where (select auth.uid()) is null or public.is_motive_admin() or not public.is_blocked_between(id, (select auth.uid()));

-- Group chats: no messages from someone either of you has blocked.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using ((public.can_use_thread(thread_id) and (sender_id is null or not public.is_blocked_between(sender_id, (select auth.uid()))))
         or public.is_motive_admin());

-- The people you've blocked (names and photos), for Settings → Privacy.
create or replace function public.my_blocked_people()
returns table (user_id uuid, name text, avatar_url text, blocked_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select b.blocked_id, coalesce(nullif(p.display_name, ''), 'Member'), p.avatar_url, b.created_at
  from public.user_blocks b join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc;
$$;
revoke execute on function public.my_blocked_people() from public, anon;
grant execute on function public.my_blocked_people() to authenticated;

create or replace function public.unblock_user(target uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.user_blocks where blocker_id = (select auth.uid()) and blocked_id = target;
$$;
revoke execute on function public.unblock_user(uuid) from public, anon;
grant execute on function public.unblock_user(uuid) to authenticated;

-- Did I block this person (not: did they block me)?
create or replace function public.i_blocked(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.user_blocks where blocker_id = (select auth.uid()) and blocked_id = target);
$$;
revoke execute on function public.i_blocked(uuid) from public, anon;
grant execute on function public.i_blocked(uuid) to authenticated;

-- 4. Bans and suspensions.
create table if not exists public.account_bans (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  until      timestamptz,             -- null: banned with no end date
  reason     text not null check (char_length(reason) between 1 and 500),
  banned_by  uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.account_bans enable row level security;
revoke all on public.account_bans from anon, authenticated;
grant select on public.account_bans to authenticated;
drop policy if exists account_bans_admin_select on public.account_bans;
create policy account_bans_admin_select on public.account_bans for select to authenticated using (public.is_motive_admin());

-- days: how long (1 to 365), or null for a ban with no end date.
create or replace function public.admin_set_ban(target uuid, days integer, reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  ends timestamptz := case when days is null then null else now() + make_interval(days => days) end;
begin
  if not public.is_motive_admin() then raise exception 'Only the Function team can do this'; end if;
  if target = auth.uid() then raise exception 'You can''t ban yourself'; end if;
  if exists (select 1 from public.profiles where id = target and is_admin) then raise exception 'Admins can''t be banned here'; end if;
  if days is not null and (days < 1 or days > 365) then raise exception 'Choose between 1 and 365 days'; end if;
  if coalesce(trim(reason), '') = '' then raise exception 'Say why'; end if;
  insert into public.account_bans (user_id, until, reason, banned_by) values (target, ends, trim(reason), auth.uid())
  on conflict (user_id) do update set until = excluded.until, reason = excluded.reason, banned_by = excluded.banned_by, created_at = now();
  -- Supabase Auth refuses to log in (or refresh) a banned account; log it out everywhere now.
  update auth.users set banned_until = coalesce(ends, 'infinity'::timestamptz) where id = target;
  if to_regclass('auth.sessions') is not null then execute 'delete from auth.sessions where user_id = $1' using target; end if;
  if to_regclass('auth.refresh_tokens') is not null then execute 'delete from auth.refresh_tokens where user_id = $1::text' using target; end if;
end;
$$;
revoke execute on function public.admin_set_ban(uuid, integer, text) from public, anon;
grant execute on function public.admin_set_ban(uuid, integer, text) to authenticated;

create or replace function public.admin_lift_ban(target uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_motive_admin() then raise exception 'Only the Function team can do this'; end if;
  delete from public.account_bans where user_id = target;
  update auth.users set banned_until = null where id = target;
end;
$$;
revoke execute on function public.admin_lift_ban(uuid) from public, anon;
grant execute on function public.admin_lift_ban(uuid) to authenticated;

-- The Function team can open a reported chat photo or video (to decide on it).
drop policy if exists chat_media_admin_select on storage.objects;
create policy chat_media_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and public.is_motive_admin());

-- 5. Deleting messages (20261127000000_chat_pins_admins.sql): group chat
--    admins can delete any message in their group chats.
create or replace function public.delete_message(mid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.messages set deleted_at = now(), body = '(deleted)', media_path = null
  where id = mid and deleted_at is null
    and (sender_id = (select auth.uid()) or public.is_motive_admin() or public.is_thread_admin(thread_id));
  if found then
    update public.threads set pinned_message_id = null, pinned_by = null, pinned_at = null where pinned_message_id = mid;
  end if;
end;
$$;

-- Pushes (20261127000000_chat_pins_admins.sql): none from someone either of you has blocked.
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
  if new.sender_id is null or new.kind in ('left', 'rejoined', 'removed') then return new; end if;
  if new.kind = 'event' then preview := left(regexp_replace(preview, ' https://\S+$', ''), 100); end if;
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
        and not exists (select 1 from public.thread_leaves l where l.thread_id = t.id and l.user_id = x.u)
        and not public.is_blocked_between(x.u, new.sender_id)
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
    loop
      perform public.queue_push(r, 'messages', who || ' in ' || (select title from public.social_events where id = t.social_event_id), preview, '/chats/' || t.id);
    end loop;
  end if;
  return new;
end;
$$;

-- The chat list (20261127000000_chat_pins_admins.sql): blocked people's messages don't count or show.
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
            and m.kind not in ('left', 'rejoined', 'removed')
            and not public.is_blocked_between(m.sender_id, (select auth.uid()))
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

-- ===== 20261129000000_split_payments.sql =====
-- =====================================================================
-- Split payments for Social plans (Stripe Connect, destination charges).
--
-- A host turns on "This event costs money" on a Social plan, enters the
-- total cost, and each person who joins pays their share (total ÷ spaces,
-- the host included) in the app. The money goes through Function's Stripe
-- account to the host's Stripe Express account, and is paid out to the
-- host's bank 48 hours after the plan ends.
--
-- What's here (the Stripe calls themselves are in supabase/functions):
--   1. payout_accounts: each host's Stripe account and whether it's ready.
--      Hosts read their own row; only the server writes it.
--   2. social_events gets collect_payments, total_cost_pence and fee_mode.
--      The price per person (cost_pence) is worked out here, and can't
--      change once anyone has paid. Collecting payments needs payouts set up.
--   3. plan_payments: one row per payment. Only the server marks a payment
--      as paid (after Stripe's webhook confirms it) or refunded.
--   4. Who's paid: plan_payment_statuses() gives the host and people going
--      a Paid / Not paid list (no amounts, no emails).
--   5. Refunds: the payer asks (plan_request_refund), only the host decides
--      (plan_decide_refund). Cancelling the plan, deleting it, or the host
--      removing someone who paid queues a refund automatically. Someone who
--      has paid can't just leave: they ask for a refund instead.
--   6. Functions for the server only (service_role): starting a payment,
--      recording what Stripe says, refunds and payouts due, and ignoring
--      webhook events already handled.
--
-- Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Hosts' Stripe accounts
-- ---------------------------------------------------------------------
create table if not exists public.payout_accounts (
  user_id           uuid primary key references public.profiles (id) on delete cascade,
  stripe_account_id text not null unique,
  details_submitted boolean not null default false,
  payouts_enabled   boolean not null default false,
  -- Ready to receive payments (Stripe's "transfers" capability is active).
  ready             boolean not null default false,
  -- What Stripe still needs, if anything (shown as "Finish setting up payouts").
  needs_info        boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.payout_accounts enable row level security;
revoke all on public.payout_accounts from anon, authenticated;
grant select on public.payout_accounts to authenticated;
drop policy if exists payout_accounts_select_own on public.payout_accounts;
create policy payout_accounts_select_own on public.payout_accounts for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 2. Paid plans
-- ---------------------------------------------------------------------
alter table public.social_events add column if not exists collect_payments boolean not null default false;
alter table public.social_events add column if not exists total_cost_pence integer
  check (total_cost_pence is null or (total_cost_pence between 100 and 1000000));
-- 'added': a service fee is added to each share, so the host gets the full share.
-- 'absorbed': people pay exactly their share and the host covers the fee.
alter table public.social_events add column if not exists fee_mode text not null default 'added';
do $$ begin
  alter table public.social_events add constraint social_events_fee_mode_check check (fee_mode in ('added', 'absorbed'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 3. Payments
-- ---------------------------------------------------------------------
create table if not exists public.plan_payments (
  id                  uuid primary key default gen_random_uuid(),
  -- Kept (as null) if the plan is deleted, so the refund can still be made.
  event_id            uuid references public.social_events (id) on delete set null,
  event_title         text not null,
  payer_id            uuid references public.profiles (id) on delete set null,
  host_id             uuid references public.profiles (id) on delete set null,
  host_account_id     text not null,
  -- What the payer is charged, the share in it, and Function's application
  -- fee (the service fee, or the Stripe fee the host absorbs, plus any
  -- Function platform fee). The host gets amount_pence - app_fee_pence.
  amount_pence        integer not null check (amount_pence >= 30),
  share_pence         integer not null check (share_pence > 0),
  fee_pence           integer not null default 0 check (fee_pence >= 0),
  app_fee_pence       integer not null default 0 check (app_fee_pence >= 0 and app_fee_pence < amount_pence),
  currency            text not null default 'gbp',
  status              text not null default 'pending' check (status in (
                        'pending',          -- payment started, not finished
                        'failed',           -- the card was declined etc.
                        'cancelled',        -- abandoned (e.g. they left before paying)
                        'paid',             -- Stripe confirmed it
                        'refund_requested', -- the payer asked; the host decides
                        'refund_declined',  -- the host said no (still paid)
                        'refund_queued',    -- waiting to be sent to Stripe
                        'refund_pending',   -- sent to Stripe, waiting for it to confirm
                        'refund_failed',    -- Stripe couldn't refund (the Function team is emailed)
                        'refunded')),
  -- Why it's being refunded: the host approved, the plan was cancelled or
  -- deleted, the payer was removed, or they paid without a place.
  refund_cause        text check (refund_cause in ('host_approved', 'cancelled', 'deleted', 'removed', 'not_going')),
  refund_reason       text check (char_length(refund_reason) <= 500),
  payment_intent_id   text unique,
  checkout_session_id text unique,
  stripe_refund_id    text unique,
  failure_message     text,
  paid_at             timestamptz,
  refund_requested_at timestamptz,
  refund_decided_at   timestamptz,
  refunded_at         timestamptz,
  paid_out_at         timestamptz,
  payout_id           text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists plan_payments_event_idx on public.plan_payments (event_id);
create index if not exists plan_payments_host_idx on public.plan_payments (host_id);
create index if not exists plan_payments_queue_idx on public.plan_payments (status) where status in ('refund_queued', 'paid', 'refund_declined');
-- One live payment per person per plan: paying twice reuses it. (A payment
-- on its way back to them doesn't count, so they can join again and pay.)
drop index if exists public.plan_payments_one_live;
create unique index plan_payments_one_live on public.plan_payments (event_id, payer_id)
  where status in ('pending', 'paid', 'refund_requested', 'refund_declined', 'refund_failed');
alter table public.plan_payments enable row level security;
revoke all on public.plan_payments from anon, authenticated;
grant select on public.plan_payments to authenticated;
drop policy if exists plan_payments_select on public.plan_payments;
create policy plan_payments_select on public.plan_payments for select to authenticated
  using (payer_id = (select auth.uid()) or host_id = (select auth.uid()));

-- Stripe sends some webhook events more than once: each is handled once.
create table if not exists public.stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- Payment notifications ("Sam paid £8", refund news) are their own kind,
-- always sent (they're about people's money, so there's no switch to turn them off).
alter table public.push_queue drop constraint if exists push_queue_kind_check;
alter table public.push_queue add constraint push_queue_kind_check
  check (kind in ('messages', 'friends', 'society_events', 'reminders', 'hosting', 'seating', 'hub', 'payments'));

-- Statuses that still hold the payer's money.
create or replace function public.payment_is_held(s text)
returns boolean language sql immutable set search_path = '' as $$
  select s in ('paid', 'refund_requested', 'refund_declined', 'refund_failed');
$$;

-- ---------------------------------------------------------------------
-- 2b. The price per person, worked out here; locked once anyone has paid
-- ---------------------------------------------------------------------
create or replace function public.social_payment_fields()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.collect_payments then
    if new.total_cost_pence is null then raise exception 'Enter the total cost'; end if;
    -- Everyone pays the same share, the host included; rounded up to the penny.
    new.cost_pence := ceil(new.total_cost_pence::numeric / new.spaces)::integer;
    if new.cost_pence < 100 then raise exception 'Each person''s share must be at least £1'; end if;
    if tg_op = 'INSERT' or not old.collect_payments then
      if not exists (select 1 from public.payout_accounts a where a.user_id = new.host_id and a.ready) then
        raise exception 'Set up payouts first (Me → Payouts) so the money can reach your bank account';
      end if;
    end if;
  end if;
  if tg_op = 'UPDATE'
     and (new.collect_payments is distinct from old.collect_payments
          or new.cost_pence is distinct from old.cost_pence
          or new.fee_mode is distinct from old.fee_mode)
     and exists (select 1 from public.plan_payments p
                 where p.event_id = old.id and (public.payment_is_held(p.status) or p.status = 'pending')) then
    raise exception 'People have already paid, so the price and number of spaces can''t change';
  end if;
  return new;
end;
$$;
revoke execute on function public.social_payment_fields() from public, anon, authenticated;
drop trigger if exists social_events_payment_fields on public.social_events;
create trigger social_events_payment_fields before insert or update on public.social_events
  for each row execute function public.social_payment_fields();

-- ---------------------------------------------------------------------
-- 4. Who's paid (for the host and people going)
-- ---------------------------------------------------------------------
create or replace function public.plan_payment_statuses(eid uuid)
returns table (user_id uuid, status text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (public.social_is_host(eid) or public.social_is_going(eid)) then return; end if;
  return query
    select m.user_id,
      coalesce((select case when public.payment_is_held(p.status) then 'paid'
                            when p.status in ('refund_queued', 'refund_pending') then 'refunding'
                            else 'unpaid' end
                from public.plan_payments p
                where p.event_id = eid and p.payer_id = m.user_id
                order by p.created_at desc limit 1), 'unpaid')
    from public.social_event_members m
    where m.event_id = eid and m.status = 'going';
end;
$$;
revoke execute on function public.plan_payment_statuses(uuid) from public, anon;
grant execute on function public.plan_payment_statuses(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Refunds
-- ---------------------------------------------------------------------
create or replace function public.plan_request_refund(eid uuid, reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  pay public.plan_payments;
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  select * into pay from public.plan_payments
  where event_id = eid and payer_id = auth.uid() and status in ('paid', 'refund_declined')
  order by created_at desc limit 1 for update;
  if not found then raise exception 'There''s no payment to refund'; end if;
  update public.plan_payments
  set status = 'refund_requested', refund_reason = nullif(trim(coalesce(reason, '')), ''),
      refund_requested_at = now(), refund_decided_at = null, updated_at = now()
  where id = pay.id;
  perform public.queue_push(pay.host_id, 'payments', 'Refund request',
    public.push_name(pay.payer_id) || ' asked for a refund for ' || pay.event_title || '. Approve or decline it on the plan.',
    '/social/' || eid, 'refund-request:' || pay.id || ':' || extract(epoch from now())::bigint);
end;
$$;
revoke execute on function public.plan_request_refund(uuid, text) from public, anon;
grant execute on function public.plan_request_refund(uuid, text) to authenticated;

create or replace function public.plan_decide_refund(pid uuid, approve boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  pay public.plan_payments;
begin
  select * into pay from public.plan_payments where id = pid for update;
  if not found or pay.host_id is distinct from auth.uid() then raise exception 'Only the host can do that'; end if;
  if pay.status <> 'refund_requested' then raise exception 'There''s no refund request to answer'; end if;
  if approve then
    update public.plan_payments set status = 'refund_queued', refund_cause = 'host_approved', refund_decided_at = now(), updated_at = now() where id = pid;
  else
    update public.plan_payments set status = 'refund_declined', refund_decided_at = now(), updated_at = now() where id = pid;
    perform public.queue_push(pay.payer_id, 'payments', 'Refund declined',
      'The host declined your refund for ' || pay.event_title || '. Your place is kept.',
      case when pay.event_id is null then null else '/social/' || pay.event_id end, 'refund-declined:' || pid);
  end if;
end;
$$;
revoke execute on function public.plan_decide_refund(uuid, boolean) from public, anon;
grant execute on function public.plan_decide_refund(uuid, boolean) to authenticated;

-- Someone who has paid asks for a refund instead of just leaving.
create or replace function public.social_leave(eid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.plan_payments p
             where p.event_id = eid and p.payer_id = (select auth.uid()) and public.payment_is_held(p.status)) then
    raise exception 'You''ve paid for this, so ask the host for a refund instead (Request refund)';
  end if;
  delete from public.social_event_members
  where event_id = eid and user_id = (select auth.uid()) and status in ('going', 'pending');
end;
$$;

-- Removed (or left before paying): refund what they paid, drop an unfinished payment.
create or replace function public.payment_on_member_gone()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.plan_payments
  set status = 'refund_queued', refund_cause = coalesce(refund_cause, 'removed'), updated_at = now()
  where event_id = old.event_id and payer_id = old.user_id and public.payment_is_held(status);
  update public.plan_payments
  set status = 'cancelled', updated_at = now()
  where event_id = old.event_id and payer_id = old.user_id and status = 'pending';
  return old;
end;
$$;
revoke execute on function public.payment_on_member_gone() from public, anon, authenticated;
drop trigger if exists social_member_gone_refund on public.social_event_members;
create trigger social_member_gone_refund after delete on public.social_event_members
  for each row execute function public.payment_on_member_gone();

-- The host cancels the plan: everyone who paid is refunded.
create or replace function public.payment_on_plan_cancelled()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.is_cancelled and not old.is_cancelled then
    update public.plan_payments
    set status = 'refund_queued', refund_cause = 'cancelled', updated_at = now()
    where event_id = new.id and (public.payment_is_held(status) or status = 'refund_requested');
    update public.plan_payments set status = 'cancelled', updated_at = now()
    where event_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;
revoke execute on function public.payment_on_plan_cancelled() from public, anon, authenticated;
drop trigger if exists social_event_cancelled_refund on public.social_events;
create trigger social_event_cancelled_refund after update of is_cancelled on public.social_events
  for each row execute function public.payment_on_plan_cancelled();

-- The plan is deleted: the same (the payment rows stay, without the plan).
create or replace function public.payment_on_plan_deleted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.plan_payments
  set status = 'refund_queued', refund_cause = 'deleted', updated_at = now()
  where event_id = old.id and public.payment_is_held(status);
  update public.plan_payments set status = 'cancelled', updated_at = now()
  where event_id = old.id and status = 'pending';
  return old;
end;
$$;
revoke execute on function public.payment_on_plan_deleted() from public, anon, authenticated;
drop trigger if exists social_event_deleted_refund on public.social_events;
create trigger social_event_deleted_refund before delete on public.social_events
  for each row execute function public.payment_on_plan_deleted();

-- ---------------------------------------------------------------------
-- 6. For the server only (the Stripe functions, as service_role)
-- ---------------------------------------------------------------------

-- Save what Stripe says about a host's account.
create or replace function public.payout_account_save(uid uuid, account text, submitted boolean, payouts boolean, is_ready boolean, needs boolean)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.payout_accounts (user_id, stripe_account_id, details_submitted, payouts_enabled, ready, needs_info)
  values (uid, account, submitted, payouts, is_ready, needs)
  on conflict (user_id) do update set stripe_account_id = excluded.stripe_account_id, details_submitted = excluded.details_submitted,
    payouts_enabled = excluded.payouts_enabled, ready = excluded.ready, needs_info = excluded.needs_info, updated_at = now();
$$;

-- Start (or carry on) a payment: checks they're going and haven't paid, and
-- returns the payment to use. Paying twice gets the same payment back.
create or replace function public.payment_start(eid uuid, payer uuid, amount integer, fee integer, app_fee integer)
returns table (payment_id uuid, status text, payment_intent_id text, checkout_session_id text, host_account_id text, event_title text, amount_pence integer)
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.social_events;
  acct text;
  pay public.plan_payments;
begin
  select * into ev from public.social_events where id = eid for update;
  if not found or ev.is_hidden then raise exception 'This plan isn''t available'; end if;
  if not ev.collect_payments then raise exception 'This plan doesn''t take payments'; end if;
  if ev.is_cancelled then raise exception 'This plan was cancelled'; end if;
  if ev.ends_at < now() then raise exception 'This plan has finished'; end if;
  if ev.host_id = payer then raise exception 'You''re the host, so you don''t pay'; end if;
  if not exists (select 1 from public.social_event_members m where m.event_id = eid and m.user_id = payer and m.status = 'going') then
    raise exception 'Join the plan first, then pay';
  end if;
  select a.stripe_account_id into acct from public.payout_accounts a where a.user_id = ev.host_id and a.ready;
  if acct is null then raise exception 'The host hasn''t finished setting up payouts yet'; end if;

  select * into pay from public.plan_payments p
  where p.event_id = eid and p.payer_id = payer
    and p.status in ('pending', 'paid', 'refund_requested', 'refund_declined', 'refund_failed')
  for update;
  if found then
    if pay.status <> 'pending' then raise exception 'You''ve already paid for this'; end if;
    -- An unfinished payment for a different amount (can't happen once the price is locked) starts again.
    if pay.amount_pence <> amount then
      update public.plan_payments set status = 'cancelled', updated_at = now() where id = pay.id;
    else
      return query select pay.id, pay.status, pay.payment_intent_id, pay.checkout_session_id, pay.host_account_id, pay.event_title, pay.amount_pence;
      return;
    end if;
  end if;
  insert into public.plan_payments (event_id, event_title, payer_id, host_id, host_account_id, amount_pence, share_pence, fee_pence, app_fee_pence)
  values (eid, ev.title, payer, ev.host_id, acct, amount, ev.cost_pence, fee, app_fee)
  returning * into pay;
  return query select pay.id, pay.status, pay.payment_intent_id, pay.checkout_session_id, pay.host_account_id, pay.event_title, pay.amount_pence;
end;
$$;

create or replace function public.payment_attach(pid uuid, intent text, session text)
returns void
language sql security definer set search_path = ''
as $$
  update public.plan_payments
  set payment_intent_id = coalesce(intent, payment_intent_id), checkout_session_id = coalesce(session, checkout_session_id), updated_at = now()
  where id = pid;
$$;

-- Stripe confirmed the payment (webhook). Tells the host; if they're no
-- longer going (or the plan was cancelled meanwhile), refunds it.
create or replace function public.payment_mark_paid(pid uuid, intent text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  pay public.plan_payments;
  ev public.social_events;
begin
  select * into pay from public.plan_payments where id = pid or (pid is null and payment_intent_id = intent) for update;
  if not found then return 'unknown'; end if;
  if pay.status not in ('pending', 'failed', 'cancelled') then return pay.status; end if;
  update public.plan_payments
  set status = 'paid', paid_at = now(), payment_intent_id = coalesce(intent, payment_intent_id), failure_message = null, updated_at = now()
  where id = pay.id;
  select * into ev from public.social_events where id = pay.event_id;
  if ev.id is null or ev.is_cancelled
     or not exists (select 1 from public.social_event_members m where m.event_id = pay.event_id and m.user_id = pay.payer_id and m.status = 'going')
     or exists (select 1 from public.plan_payments o where o.id <> pay.id and o.event_id = pay.event_id and o.payer_id = pay.payer_id and public.payment_is_held(o.status)) then
    update public.plan_payments set status = 'refund_queued', refund_cause = case when ev.is_cancelled then 'cancelled' else 'not_going' end, updated_at = now()
    where id = pay.id;
    return 'refund_queued';
  end if;
  perform public.queue_push(pay.host_id, 'payments', 'Payment received',
    public.push_name(pay.payer_id) || ' paid £' || to_char(pay.share_pence / 100.0, 'FM999990.00') || ' for ' || pay.event_title,
    '/social/' || pay.event_id, 'paid:' || pay.id);
  return 'paid';
end;
$$;

create or replace function public.payment_mark_failed(pid uuid, intent text, message text)
returns void
language sql security definer set search_path = ''
as $$
  update public.plan_payments
  set status = 'failed', failure_message = left(message, 300), updated_at = now()
  where (id = pid or (pid is null and payment_intent_id = intent)) and status = 'pending';
$$;

-- Refunds waiting to be sent to Stripe.
create or replace function public.payment_refunds_due()
returns table (payment_id uuid, payment_intent_id text, amount_pence integer, refund_cause text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.payment_intent_id, p.amount_pence, p.refund_cause from public.plan_payments p
  where p.status = 'refund_queued' and p.payment_intent_id is not null
  order by p.updated_at limit 50;
$$;

create or replace function public.payment_refund_started(pid uuid, refund text)
returns void
language sql security definer set search_path = ''
as $$
  update public.plan_payments set status = 'refund_pending', stripe_refund_id = refund, updated_at = now()
  where id = pid and status = 'refund_queued';
$$;

-- Stripe confirmed the refund (webhook). The payer is told; after a
-- refund the host approved, they leave the plan.
create or replace function public.payment_mark_refunded(pid uuid, intent text, refund text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  pay public.plan_payments;
begin
  select * into pay from public.plan_payments where id = pid or (pid is null and payment_intent_id = intent) for update;
  if not found or pay.status = 'refunded' then return; end if;
  update public.plan_payments
  set status = 'refunded', stripe_refund_id = coalesce(refund, stripe_refund_id), refunded_at = now(), updated_at = now()
  where id = pay.id;
  if pay.refund_cause = 'host_approved' and pay.event_id is not null then
    delete from public.social_event_members where event_id = pay.event_id and user_id = pay.payer_id;
  end if;
  perform public.queue_push(pay.payer_id, 'payments', 'Refund on its way',
    '£' || to_char(pay.amount_pence / 100.0, 'FM999990.00') || ' for ' || pay.event_title || ' is being refunded to your card. It can take 5 to 10 days to show.',
    case when pay.event_id is null then null else '/social/' || pay.event_id end, 'refunded:' || pay.id);
end;
$$;

-- Stripe couldn't refund: the money stays put and the Function team is emailed.
create or replace function public.payment_refund_failed(pid uuid, intent text, message text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  pay public.plan_payments;
begin
  select * into pay from public.plan_payments where id = pid or (pid is null and payment_intent_id = intent) for update;
  if not found then return; end if;
  update public.plan_payments set status = 'refund_failed', failure_message = left(message, 300), updated_at = now() where id = pay.id;
  insert into public.email_queue (to_address, subject, body)
  values (public.report_email_address(), '[Function payments] A refund failed',
          'A refund failed and needs a look in the Stripe dashboard.' || chr(10) || chr(10)
          || 'Plan: ' || pay.event_title || chr(10) || 'Payment id: ' || pay.id || chr(10)
          || 'Stripe payment: ' || coalesce(pay.payment_intent_id, '-') || chr(10) || 'Stripe said: ' || coalesce(message, '-'));
end;
$$;

-- A payer disputed a charge with their bank (Function is liable): email the team.
create or replace function public.payment_disputed(intent text, amount integer, reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  pay public.plan_payments;
begin
  select * into pay from public.plan_payments where payment_intent_id = intent;
  insert into public.email_queue (to_address, subject, body)
  values (public.report_email_address(), '[Function payments] A payment was disputed',
          'Someone disputed a payment with their bank. Respond in the Stripe dashboard (Payments → Disputes) before the deadline.' || chr(10) || chr(10)
          || 'Plan: ' || coalesce(pay.event_title, '(unknown)') || chr(10) || 'Payment id: ' || coalesce(pay.id::text, '-') || chr(10)
          || 'Stripe payment: ' || coalesce(intent, '-') || chr(10) || 'Amount: £' || to_char(coalesce(amount, 0) / 100.0, 'FM999990.00') || chr(10)
          || 'Reason: ' || coalesce(reason, '-'));
end;
$$;

-- Hosts to pay out: money for plans that ended more than hold_hours ago,
-- still held (refund requests not yet answered wait), not yet paid out.
create or replace function public.payouts_due(hold_hours integer default 48)
returns table (host_id uuid, host_account_id text, amount_pence integer, payment_ids uuid[])
language sql stable security definer set search_path = ''
as $$
  select p.host_id, p.host_account_id, sum(p.amount_pence - p.app_fee_pence)::integer, array_agg(p.id)
  from public.plan_payments p
  join public.social_events e on e.id = p.event_id
  where p.status in ('paid', 'refund_declined') and p.paid_out_at is null
    and e.ends_at < now() - make_interval(hours => hold_hours)
  group by p.host_id, p.host_account_id;
$$;

create or replace function public.payouts_mark(ids uuid[], payout text)
returns void
language sql security definer set search_path = ''
as $$
  update public.plan_payments set paid_out_at = now(), payout_id = payout, updated_at = now() where id = any(ids) and paid_out_at is null;
$$;

-- Each webhook event once: true the first time.
create or replace function public.stripe_event_first(event_id text, event_type text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.stripe_events (id, type) values (event_id, event_type);
  return true;
exception when unique_violation then
  return false;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.payout_account_save(uuid, text, boolean, boolean, boolean, boolean)',
    'public.payment_start(uuid, uuid, integer, integer, integer)',
    'public.payment_attach(uuid, text, text)',
    'public.payment_mark_paid(uuid, text)',
    'public.payment_mark_failed(uuid, text, text)',
    'public.payment_refunds_due()',
    'public.payment_refund_started(uuid, text)',
    'public.payment_mark_refunded(uuid, text, text)',
    'public.payment_refund_failed(uuid, text, text)',
    'public.payment_disputed(text, integer, text)',
    'public.payouts_due(integer)',
    'public.payouts_mark(uuid[], text)',
    'public.stripe_event_first(text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ===== 20261201000000_instant_push.sql =====
-- =====================================================================
-- Instant push notifications.
--
-- Until now notifications waited in push_queue until the once-a-minute
-- timer (supabase/RUN_ONCE_push_cron.sql) asked the send-push function to
-- send them: anything from a few seconds to just over a minute.
--
-- Now, as soon as anything is added to push_queue, the database asks
-- send-push to send it (once per transaction, however many notifications
-- it added, e.g. a message to a big group chat). The request goes out
-- after the transaction commits, so the notifications are there to send.
-- The once-a-minute timer stays as the backup: if the instant call can't
-- be made, or fails, the next tick sends it.
--
-- Nobody gets the same notification twice, even when the instant call and
-- the timer run at the same moment: send-push now claims its batch with
-- claim_push_batch(), which locks the rows it takes, so two runs never
-- pick the same notification. (A claim that never finished, e.g. the
-- function crashed, is picked up again after 2 minutes.)
--
-- The function's address and the push secret are NOT in this file. They
-- live in Supabase Vault, added once with supabase/RUN_ONCE_instant_push.sql
-- (you type the secret in there, in the SQL Editor; never commit it). Until
-- they're added, this does nothing and the timer carries on as before.
--
-- Safe to run more than once.
-- =====================================================================

-- 1. Claiming a batch to send.
alter table public.push_queue add column if not exists claimed_at timestamptz;

create or replace function public.claim_push_batch(batch integer default 200)
returns table (id bigint, user_id uuid, kind text, title text, body text, url text)
language sql volatile security definer set search_path = ''
as $$
  update public.push_queue q
  set claimed_at = now()
  where q.id in (
    select p.id from public.push_queue p
    where p.sent_at is null and (p.claimed_at is null or p.claimed_at < now() - interval '2 minutes')
    order by p.created_at
    limit greatest(1, least(coalesce(batch, 200), 500))
    for update skip locked
  )
  returning q.id, q.user_id, q.kind, q.title, q.body, q.url;
$$;
revoke execute on function public.claim_push_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_push_batch(integer) to service_role;

-- 2. The instant nudge: after notifications are queued, call send-push.
create or replace function public.kick_send_push()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  fn_url text;
  secret text;
begin
  -- Once per transaction is enough: the call is made after it commits.
  if coalesce(current_setting('function.push_kicked', true), '') = 'yes' then return null; end if;
  perform set_config('function.push_kicked', 'yes', true);
  begin
    select s.decrypted_secret into fn_url from vault.decrypted_secrets s where s.name = 'function_send_push_url';
    select s.decrypted_secret into secret from vault.decrypted_secrets s where s.name = 'function_push_secret';
    if coalesce(fn_url, '') = '' or coalesce(secret, '') = '' then return null; end if;
    perform net.http_post(
      url := fn_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  exception when others then
    -- Never hold up whatever queued the notification: the timer sends it.
    null;
  end;
  return null;
end;
$$;
revoke execute on function public.kick_send_push() from public, anon, authenticated;

drop trigger if exists push_queue_kick on public.push_queue;
create trigger push_queue_kick after insert on public.push_queue
  for each statement execute function public.kick_send_push();

-- ===== seed.sql =====
-- =====================================================================
-- Motive: starter data
--
-- Run AFTER the schema file (supabase/migrations/...initial_schema.sql).
-- Safe to run more than once: it skips rows that already exist.
--
-- NOTE: coordinates are approximate (to within ~50m). Check each pin on
-- the map before launch and adjust the lat/lng if it's off.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Venues: places events can be pinned to
-- ---------------------------------------------------------------------

insert into public.venues (name, short_name, kind, address, lat, lng)
select v.name, v.short_name, v.kind::public.venue_kind, v.address, v.lat, v.lng
from (values
  -- LSE campus
  ('Saw Swee Hock Student Centre', 'SAW', 'campus', '1 Sheffield Street, London WC2A 2AP',      51.51460, -0.11630),
  ('Marshall Building',            'MAR', 'campus', '44 Lincoln''s Inn Fields, London WC2A 3LY', 51.51560, -0.11700),
  ('Centre Building',              'CBG', 'campus', 'Houghton Street, London WC2A 2AE',          51.51410, -0.11670),
  ('Old Building',                 'OLD', 'campus', 'Houghton Street, London WC2A 2AE',          51.51380, -0.11680),
  ('New Academic Building',        'NAB', 'campus', '54 Lincoln''s Inn Fields, London WC2A 3LJ', 51.51530, -0.11820),
  ('LSE Library',                  'LIB', 'campus', '10 Portugal Street, London WC2A 2HD',       51.51480, -0.11760),
  ('Peacock Theatre',              'PEA', 'campus', 'Portugal Street, London WC2A 2HT',          51.51460, -0.11920),
  ('Clement House',                'CLM', 'campus', '99 Aldwych, London WC2B 4JF',               51.51310, -0.11620),

  -- LSE halls
  ('Bankside House',               null,  'hall',   '24 Sumner Street, London SE1 9JA',          51.50770, -0.09830),
  ('Butler''s Wharf Residence',    null,  'hall',   '11 Gainsford Street, London SE1 2NE',       51.50250, -0.07200),
  ('Carr-Saunders Hall',           null,  'hall',   '18-24 Fitzroy Street, London W1T 4BN',      51.52140, -0.13810),
  ('Grosvenor House',              null,  'hall',   '141-143 Drury Lane, London WC2B 5TB',       51.51430, -0.12180),
  ('High Holborn Residence',       null,  'hall',   '178 High Holborn, London WC1V 7AA',         51.51680, -0.12530),
  ('Lilian Knowles House',         null,  'hall',   '50 Crispin Street, London E1 6HQ',          51.51930, -0.07570),
  ('Northumberland House',         null,  'hall',   '8a Northumberland Avenue, London WC2N 5BY', 51.50750, -0.12550),
  ('Passfield Hall',               null,  'hall',   '1-7 Endsleigh Place, London WC1H 0PW',      51.52620, -0.13000),
  ('Rosebery Hall',                null,  'hall',   '90 Rosebery Avenue, London EC1R 4TY',       51.52650, -0.10930),
  ('Sidney Webb House',            null,  'hall',   '7 Great Dover Street, London SE1 4YA',      51.50100, -0.09250),

  -- Other universities
  ('UCL Main Campus',              'UCL', 'university', 'Gower Street, London WC1E 6BT',         51.52460, -0.13400),
  ('King''s College London, Strand', 'KCL', 'university', 'Strand, London WC2R 2LS',             51.51150, -0.11600),
  ('Imperial College, South Kensington', 'ICL', 'university', 'Exhibition Road, London SW7 2AZ', 51.49880, -0.17490)
) as v(name, short_name, kind, address, lat, lng)
where not exists (select 1 from public.venues existing where existing.name = v.name);


-- ---------------------------------------------------------------------
-- Organisations: halls, other universities, and a first LSE society.
-- The full LSE society list gets added in a later step.
-- ---------------------------------------------------------------------

insert into public.societies (slug, name, kind, university, is_verified)
values
  -- LSE halls
  ('bankside-house',          'Bankside House',            'hall', 'LSE', true),
  ('butlers-wharf',           'Butler''s Wharf Residence', 'hall', 'LSE', true),
  ('carr-saunders-hall',      'Carr-Saunders Hall',        'hall', 'LSE', true),
  ('grosvenor-house',         'Grosvenor House',           'hall', 'LSE', true),
  ('high-holborn',            'High Holborn Residence',    'hall', 'LSE', true),
  ('lilian-knowles-house',    'Lilian Knowles House',      'hall', 'LSE', true),
  ('northumberland-house',    'Northumberland House',      'hall', 'LSE', true),
  ('passfield-hall',          'Passfield Hall',            'hall', 'LSE', true),
  ('rosebery-hall',           'Rosebery Hall',             'hall', 'LSE', true),
  ('sidney-webb-house',       'Sidney Webb House',         'hall', 'LSE', true),

  -- Other universities
  ('ucl',                     'UCL',                       'university', 'UCL',      true),
  ('kings-college-london',    'King''s College London',    'university', 'KCL',      true),
  ('imperial-college-london', 'Imperial College London',   'university', 'Imperial', true),

  -- LSE societies
  ('lse-poker-society',       'LSE Poker Society',         'society', 'LSE', false)
on conflict (slug) do nothing;

