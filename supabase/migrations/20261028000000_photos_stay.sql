-- Item 12: profile photos no longer expire after 30 days. A photo stays on
-- the profile until its owner removes it (to the Archive) or deletes it.
-- Nothing is deleted; no tables or columns are removed or renamed.

-- 1. Photos that already ran out are in their owner's Archive today. Mark
--    them as archived (dated when they ran out) so they stay there.
update public.profile_photos
set archived_at = activated_at + interval '30 days'
where archived_at is null and not pinned and activated_at <= now() - interval '30 days';

-- 2. A photo is on the profile if it hasn't been archived. (These replace
--    the versions with the 30-day rule; same names and inputs.)
create or replace function public.current_photo_count(person uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.profile_photos p
  where p.user_id = person and p.archived_at is null;
$$;

create or replace function public.pin_profile_photo(pid uuid, pin boolean)
returns void
language sql security definer set search_path = ''
as $$
  update public.profile_photos set pinned = pin
  where id = pid and user_id = (select auth.uid()) and archived_at is null;
$$;

-- 3. Who can see a photo: the owner always; other people while it's on the
--    profile (not archived), unless one of you has blocked the other.
alter policy profile_photos_select on public.profile_photos
  using (
    user_id = (select auth.uid())
    or public.is_motive_admin()
    or (archived_at is null and not public.is_blocked_between(user_id, (select auth.uid())))
  );

alter policy profile_photos_files_select on storage.objects
  using (
    bucket_id = 'profile-photos' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_motive_admin()
      or exists (
        select 1 from public.profile_photos p
        where p.path = name and p.archived_at is null
          and not public.is_blocked_between(p.user_id, (select auth.uid()))
      )
    )
  );
