-- Recommended events: how many of your friends are hosting or going to an
-- event. Only adds one function. It returns counts, never names, and only
-- for events the caller can already see (the same rules as the event
-- tables' security policies), and only about the caller's accepted friends.
--
-- The app passes the ids of the events it has already loaded; the scoring
-- itself happens in the app (packages/shared/src/recommend.ts). The count
-- covers accepted friends only, so "2 friends going" is the one thing a
-- friend learns about you here: that you're going to an event they can see.

create or replace function public.my_friend_event_signals(society_ids uuid[] default '{}', social_ids uuid[] default '{}')
returns table (kind text, event_id uuid, hosting boolean, going integer)
language sql stable security definer set search_path = ''
as $$
  with friends as materialized (
    select case when f.requester_id = (select auth.uid()) then f.addressee_id else f.requester_id end as fid
    from public.friendships f
    where f.status = 'accepted' and (select auth.uid()) in (f.requester_id, f.addressee_id)
  ),
  -- The counts first (cheap), then the visibility rules only for events with a signal.
  soc as materialized (
    select e.id, e.society_id, e.audience, e.host_user_id, e.visibility,
           (e.host_user_id is not null and e.host_user_id in (select fid from friends)) as hosting,
           (select count(*)::integer from public.event_entries en
             where en.event_id = e.id and en.status = 'going' and en.user_id in (select fid from friends)) as going
    from public.events e
    where (select auth.uid()) is not null
      and e.id = any(coalesce(society_ids, '{}'))
      and not e.is_hidden and not e.is_cancelled
  ),
  sol as materialized (
    select se.id, se.host_id, se.friends_only,
           (se.host_id in (select fid from friends)) as hosting,
           (select count(*)::integer from public.social_event_members m
             where m.event_id = se.id and m.status = 'going' and m.user_id in (select fid from friends)) as going
    from public.social_events se
    where (select auth.uid()) is not null
      and se.id = any(coalesce(social_ids, '{}'))
      and not se.is_hidden and not se.is_cancelled
  )
  select 'society'::text, s.id, s.hosting, s.going
  from soc s
  where (s.hosting or s.going > 0)
    and (s.society_id is null or public.can_see_society_event(s.society_id, s.audience) or public.has_entry(s.id))
    and (s.host_user_id is null
         or (not public.is_blocked_between(s.host_user_id, (select auth.uid()))
             and (s.visibility = 'public' or public.are_friends(s.host_user_id, (select auth.uid())) or public.has_entry(s.id))))
  union all
  select 'social'::text, s.id, s.hosting, s.going
  from sol s
  where (s.hosting or s.going > 0)
    and not public.is_blocked_between(s.host_id, (select auth.uid()))
    and (not s.friends_only or public.are_friends(s.host_id, (select auth.uid())) or public.social_is_member(s.id));
$$;

revoke execute on function public.my_friend_event_signals(uuid[], uuid[]) from public, anon;
grant execute on function public.my_friend_event_signals(uuid[], uuid[]) to authenticated;
