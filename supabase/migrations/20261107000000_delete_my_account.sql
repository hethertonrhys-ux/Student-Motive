-- =====================================================================
-- "Delete my account" (needed for the App Store: Apple requires it for
-- any app with sign-up).
--
-- Only adds one function; nothing existing changes. Deleting the login
-- row removes the profile, and everything already linked to the profile
-- goes with it (friends, follows, events you host, "going" history, your
-- prompts and photos' records). Messages stay, shown as from a "Former
-- member", as the privacy policy says. Your profile picture and photos
-- are removed from storage too.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not logged in';
  end if;
  -- The files behind your profile picture and your 5 photos.
  delete from storage.objects
   where bucket_id in ('avatars', 'profile-photos')
     and name like me::text || '/%';
  -- The login itself; the profile and everything linked to it cascade.
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
