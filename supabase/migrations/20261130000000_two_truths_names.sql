-- =====================================================================
-- Two truths and a lie: say who played.
--
-- The owner's notifications now name each person who played their Two
-- truths and a lie (and whether they spotted the lie), so they can tap
-- through to that person's profile. Before, only people who got it right
-- were named.
--
-- Who can see what:
--   * Only the owner of the Two truths sees who played theirs (this
--     function only ever returns the caller's own game).
--   * Names and profile pictures only, never emails.
--   * Someone either of you has blocked isn't listed.
--   * The last 30 days only.
-- The guesser is told on the game itself that the owner will see they
-- played.
--
-- Safe to run more than once.
-- =====================================================================

create or replace function public.my_two_truths_plays()
returns table (guesser_id uuid, name text, avatar_url text, correct boolean, played_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select g.guesser_id,
         coalesce(nullif(p.display_name, ''), 'Someone'),
         p.avatar_url,
         g.correct,
         g.created_at
  from public.two_truths_guesses g
  join public.profiles p on p.id = g.guesser_id
  where g.owner_id = (select auth.uid())
    and g.created_at > now() - interval '30 days'
    and not public.is_blocked_between(g.owner_id, g.guesser_id)
  order by g.created_at desc
  limit 500;
$$;

revoke execute on function public.my_two_truths_plays() from public, anon;
grant execute on function public.my_two_truths_plays() to authenticated;
