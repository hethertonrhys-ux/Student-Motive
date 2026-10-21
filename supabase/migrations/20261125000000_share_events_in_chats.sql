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
