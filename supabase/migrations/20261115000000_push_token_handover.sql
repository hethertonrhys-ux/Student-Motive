-- A phone's (or browser's) push token belongs to whoever is logged in on it
-- now. Before, when a second person logged in on a phone that had been used
-- by someone else who didn't log out, saving the token was refused (the row
-- still belonged to the first person), so the first person kept getting the
-- second person's notifications on that phone. Only adds one function.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.

create or replace function public.claim_push_token(p_token text, p_platform text, p_subscription jsonb default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Log in first'; end if;
  if p_platform not in ('ios', 'android', 'web') then raise exception 'Unknown platform'; end if;
  if coalesce(length(p_token), 0) = 0 or length(p_token) > 2000 then raise exception 'Bad token'; end if;
  -- The device now belongs to me: forget it for anyone else.
  delete from public.push_tokens where token = p_token and user_id <> uid;
  insert into public.push_tokens (user_id, token, platform, subscription, last_seen_at)
  values (uid, p_token, p_platform, p_subscription, now())
  on conflict (token) do update set platform = excluded.platform, subscription = excluded.subscription, last_seen_at = now();
end;
$$;
revoke execute on function public.claim_push_token(text, text, jsonb) from public, anon;
grant execute on function public.claim_push_token(text, text, jsonb) to authenticated;
