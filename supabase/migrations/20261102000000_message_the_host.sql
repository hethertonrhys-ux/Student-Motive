-- Follow-up: anyone who can see a Social event can message its host, even
-- if they aren't friends (e.g. to ask a question before joining). The chat
-- is an ordinary private chat between the two of them. Blocking still
-- stops it. Run this AFTER 20261027000000_social_event_chats.sql.
-- Only adds a column and a function, and widens one rule.

-- The event a non-friend chat was started from.
alter table public.threads add column if not exists via_social_event uuid
  references public.social_events (id) on delete set null;

-- Who can read and write in a chat: as before, plus a chat started with an
-- event's host (unless one of you has blocked the other).
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
        and (public.is_event_host(t.event_id) or public.is_going_to(t.event_id)))
      or (t.social_event_id is not null
        and (public.social_is_host(t.social_event_id) or public.social_is_going(t.social_event_id)))
    )
  );
$$;

-- Open (or create) a private chat with the host of a Social event you can see.
create or replace function public.open_host_dm(eid uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  host uuid;
  tid uuid;
begin
  if uid is null then raise exception 'Log in first'; end if;
  select e.host_id into host from public.social_events e
  where e.id = eid and not e.is_cancelled
    and (not e.friends_only or public.are_friends(e.host_id, uid) or e.host_id = uid);
  if host is null then raise exception 'Event not found'; end if;
  if host = uid then raise exception 'This is your event'; end if;
  if public.is_blocked_between(host, uid) then raise exception 'You can''t message this person'; end if;
  insert into public.threads (user_a, user_b, via_social_event) values (least(uid, host), greatest(uid, host), eid)
  on conflict (user_a, user_b) do update set via_social_event = coalesce(public.threads.via_social_event, excluded.via_social_event);
  select id into tid from public.threads where user_a = least(uid, host) and user_b = greatest(uid, host);
  return tid;
end;
$$;
revoke execute on function public.open_host_dm(uuid) from public, anon;
grant execute on function public.open_host_dm(uuid) to authenticated;
