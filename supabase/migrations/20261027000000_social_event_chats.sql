-- Item 8: every Social event gets a group chat, named after the event.
-- It reuses the existing chats (threads and messages). Who's in the chat
-- isn't stored: the host and everyone going can use it, so joining adds you,
-- leaving or being removed takes you out, and the host is always in.
-- Only adds things: one new column, a trigger, and updated chat rules.

-- 1. A chat can now belong to a Social event.
alter table public.threads add column if not exists social_event_id uuid unique
  references public.social_events (id) on delete cascade;

-- The old rule said a chat is either an event chat or a two-person chat;
-- swap it for one that also allows a Social event chat (existing chats all
-- still pass).
alter table public.threads drop constraint if exists threads_check;
alter table public.threads add constraint threads_kind_check check (
  (event_id is not null and social_event_id is null and user_a is null and user_b is null)
  or (social_event_id is not null and event_id is null and user_a is null and user_b is null)
  or (event_id is null and social_event_id is null and user_a is not null and user_b is not null and user_a < user_b)
);

-- 2. Who can read and write in a chat: as before, plus the host and people
--    going for a Social event chat.
create or replace function public.can_use_thread(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.threads t
    where t.id = tid and (
      (t.event_id is null and t.social_event_id is null
        and (select auth.uid()) in (t.user_a, t.user_b)
        and public.are_friends(t.user_a, t.user_b))
      or (t.event_id is not null
        and (public.is_event_host(t.event_id) or public.is_going_to(t.event_id)))
      or (t.social_event_id is not null
        and (public.social_is_host(t.social_event_id) or public.social_is_going(t.social_event_id)))
    )
  );
$$;

-- 3. Every new Social event gets its chat straight away...
create or replace function public.social_event_create_chat()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.threads (social_event_id) values (new.id) on conflict (social_event_id) do nothing;
  return new;
end;
$$;

drop trigger if exists social_events_create_chat on public.social_events;
create trigger social_events_create_chat after insert on public.social_events
  for each row execute function public.social_event_create_chat();

-- ...and so does every Social event that already exists.
insert into public.threads (social_event_id)
select id from public.social_events
on conflict (social_event_id) do nothing;

-- 4. The chat list: as before, plus the Social event's title and id.
--    (Adding a column to what it returns means re-creating it.)
drop function if exists public.my_threads();
create function public.my_threads()
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
  order by coalesce(lm.created_at, t.created_at) desc
  limit 100;
$$;
