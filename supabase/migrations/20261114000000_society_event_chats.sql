-- Society event group chats. Every event (society or student-hosted) gets
-- its chat the moment it's created, like Social plans already do. Who can
-- use it follows the event: people going, the host, and (for a society's
-- event) its committee, so joining the event adds you and leaving removes
-- you. Chats of finished events drop off the list a week after the end
-- (nothing is deleted). Only adds things.

-- 1. A chat the moment an event is created...
create or replace function public.event_create_chat()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.threads (event_id) values (new.id) on conflict (event_id) do nothing;
  return new;
end;
$$;
drop trigger if exists events_create_chat on public.events;
create trigger events_create_chat after insert on public.events
  for each row execute function public.event_create_chat();

-- ...and for every event that hasn't finished yet.
insert into public.threads (event_id)
select e.id from public.events e where e.ends_at > now()
on conflict (event_id) do nothing;

-- 2. Who can use a chat: as before, plus a society's committee in its
--    events' chats.
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
             or public.is_going_to(t.event_id)
             or exists (select 1 from public.events e where e.id = t.event_id and e.society_id is not null and public.is_society_admin(e.society_id))))
      or (t.social_event_id is not null
        and (public.social_is_host(t.social_event_id) or public.social_is_going(t.social_event_id)))
    )
  );
$$;

-- Opening an event's chat no longer needs a student host; the same people
-- as above may open it (it already exists for every new event).
create or replace function public.open_event_chat(eid uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  tid uuid;
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  if not (public.is_event_host(eid) or public.is_going_to(eid)
          or exists (select 1 from public.events e where e.id = eid and e.society_id is not null and public.is_society_admin(e.society_id))) then
    raise exception 'Only people going can see the chat';
  end if;
  insert into public.threads (event_id) values (eid) on conflict (event_id) do nothing;
  select id into tid from public.threads where event_id = eid;
  return tid;
end;
$$;

-- 3. Who counts as the host of an event: the student hosting it, or the
--    society's committee. Shown with the Host badge in the chat and the
--    going list. Only for events the caller is part of.
create or replace function public.event_hosts(eid uuid)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select e.host_user_id from public.events e
  where e.id = eid and e.host_user_id is not null
  union
  select a.user_id from public.society_admins a
  join public.events e on e.society_id = a.society_id
  where e.id = eid
    and ((select auth.uid()) is not null)
    and (public.is_going_to(eid) or public.is_society_admin(e.society_id) or public.is_society_member(e.society_id));
$$;
revoke execute on function public.event_hosts(uuid) from public, anon;
grant execute on function public.event_hosts(uuid) to authenticated;

-- 4. The chat list: as before, but chats of events that finished more than
--    a week ago drop off (the chat itself stays).
create or replace function public.my_threads()
returns table (
  id uuid, event_id uuid, title text, other_id uuid, other_name text, other_avatar text,
  last_body text, last_at timestamptz, last_sender uuid, unread bigint, social_event_id uuid
)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.event_id,
         coalesce(e.title, se.title, coalesce(nullif(op.display_name, ''), 'Member')),
         op.id, coalesce(nullif(op.display_name, ''), 'Member'), op.avatar_url,
         lm.body, coalesce(lm.created_at, t.created_at), lm.sender_id,
         (select count(*) from public.messages m
          where m.thread_id = t.id and m.sender_id is distinct from (select auth.uid())
            and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)),
         t.social_event_id
  from public.threads t
  left join public.events e on e.id = t.event_id
  left join public.social_events se on se.id = t.social_event_id
  left join public.profiles op on op.id = case when t.user_a = (select auth.uid()) then t.user_b else t.user_a end
                               and t.event_id is null and t.social_event_id is null
  left join public.thread_reads r on r.thread_id = t.id and r.user_id = (select auth.uid())
  left join lateral (
    select body, created_at, sender_id from public.messages m
    where m.thread_id = t.id order by created_at desc limit 1
  ) lm on true
  where public.can_use_thread(t.id)
    and (e.id is null or e.ends_at > now() - interval '7 days')
    and (se.id is null or se.ends_at > now() - interval '7 days')
  order by coalesce(lm.created_at, t.created_at) desc
  limit 100;
$$;

-- 5. New messages in an event chat also reach the society's committee
--    (they can turn "Messages" off in their notification settings).
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
