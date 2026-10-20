-- Security fixes for problems found while adding the Society Hub. They are
-- independent of everything else in this branch and safe to run on their
-- own, straight away. Only tightens permissions; no data changes.
--
-- 1. profile_cards is the public "name, photo, course" view of every profile.
--    Supabase gives logged-in users every privilege on new views by default,
--    and this view runs with the owner's rights, so any logged-in student
--    could UPDATE or DELETE other people's profiles through it. It becomes
--    read-only.
revoke insert, update, delete, truncate, references, trigger on public.profile_cards from public, anon, authenticated;
grant select on public.profile_cards to authenticated;

-- 2. Server-only push helpers. They were meant to be called only by other
--    database functions (which still can), but the default grants let any
--    logged-in student call queue_push and send any notification to anyone.
revoke execute on function public.queue_push(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.queue_event_reminders() from public, anon, authenticated;
revoke execute on function public.push_name(uuid) from public, anon, authenticated;

-- 3. The committee's member list no longer includes members' email
--    addresses (only Function admins see those). Committees see names; the
--    emails they typed in themselves as invites are still listed, since that
--    is how they manage invites.
create or replace function public.society_member_list(sid uuid)
returns table (user_id uuid, name text, email text, status text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.user_id, coalesce(nullif(p.display_name, ''), nullif(p.full_name, ''), 'Member'),
         case when public.is_motive_admin() then p.email end,
         m.status::text, m.created_at
  from public.society_members m
  join public.profiles p on p.id = m.user_id
  where m.society_id = sid and public.is_society_admin(sid)
  union all
  select null, null, i.email, 'invited', i.created_at
  from public.society_member_invites i
  where i.society_id = sid and public.is_society_admin(sid)
    and not exists (select 1 from public.profiles p2 join public.society_members m2 on m2.user_id = p2.id
                    where p2.email = i.email and m2.society_id = sid)
$$;
