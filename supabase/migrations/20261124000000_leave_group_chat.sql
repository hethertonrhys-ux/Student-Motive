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
