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
