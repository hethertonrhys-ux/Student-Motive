-- =====================================================================
-- Function: profile upgrade.
--   * Societies on profiles: a READ-ONLY function that lists someone's
--     approved memberships and committee roles. No Societies table,
--     rule or code is changed.
--   * "My 5": up to 5 current photos per person. Each lasts 30 days
--     unless pinned, then moves to the owner's private Archive.
--   * Reporting photos, for the Function team to review.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Profile settings (kept separate from the shared profiles table)
-- ---------------------------------------------------------------------

create table public.profile_settings (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  show_societies boolean not null default true
);

alter table public.profile_settings enable row level security;
create policy profile_settings_own on public.profile_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));


-- ---------------------------------------------------------------------
-- 2. Societies someone belongs to (read-only)
-- ---------------------------------------------------------------------

-- Approved memberships and committee roles, for showing on a profile.
-- Only for logged-in people; empty if the person has hidden them (unless
-- it's you) or if either of you has blocked the other.
create function public.profile_societies(person uuid)
returns table (id uuid, name text, slug text, logo_url text, is_committee boolean)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.name, s.slug, s.logo_url, bool_or(r.committee)
  from (
    select society_id, false as committee from public.society_members where user_id = person and status = 'approved'
    union all
    select society_id, true from public.society_admins where user_id = person
  ) r
  join public.societies s on s.id = r.society_id
  where (select auth.uid()) is not null
    and not public.is_blocked_between(person, (select auth.uid()))
    and (
      person = (select auth.uid())
      or coalesce((select show_societies from public.profile_settings where user_id = person), true)
    )
  group by s.id, s.name, s.slug, s.logo_url
  order by bool_or(r.committee) desc, s.name;
$$;
revoke execute on function public.profile_societies(uuid) from public, anon;
grant execute on function public.profile_societies(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 3. "My 5" photos
-- ---------------------------------------------------------------------

-- Private storage: photos are shown through short-lived links that only
-- logged-in people can get.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create table public.profile_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  path         text not null unique,   -- <user-id>/<random>.jpg in the profile-photos bucket
  created_at   timestamptz not null default now(),
  activated_at timestamptz not null default now(),   -- the 30 days count from here
  pinned       boolean not null default false,       -- pinned photos never expire
  archived_at  timestamptz                           -- moved to the Archive by hand
);
create index profile_photos_user_idx on public.profile_photos (user_id, activated_at desc);

-- A photo is on the profile if it hasn't been archived and is pinned or
-- under 30 days old. Everything else is in the owner's Archive.
create function public.current_photo_count(person uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.profile_photos p
  where p.user_id = person and p.archived_at is null and (p.pinned or p.activated_at > now() - interval '30 days');
$$;

-- Add a photo you've uploaded. Needs a free space.
create function public.add_profile_photo(photo_path text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  pid uuid;
begin
  if uid is null then raise exception 'Log in first'; end if;
  if split_part(photo_path, '/', 1) <> uid::text then raise exception 'Not your photo'; end if;
  perform 1 from public.profiles where id = uid for update;  -- one upload at a time per person
  if public.current_photo_count(uid) >= 5 then
    raise exception 'All 5 spaces are full. Remove or archive a photo first.';
  end if;
  insert into public.profile_photos (user_id, path) values (uid, photo_path) returning id into pid;
  return pid;
end;
$$;

create function public.archive_profile_photo(pid uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.profile_photos set archived_at = now(), pinned = false
  where id = pid and user_id = (select auth.uid());
$$;

-- Put a photo from the Archive back on your profile, for a fresh 30 days.
create function public.restore_profile_photo(pid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  perform 1 from public.profiles where id = uid for update;
  if not exists (select 1 from public.profile_photos where id = pid and user_id = uid) then raise exception 'Photo not found'; end if;
  if public.current_photo_count(uid) >= 5 then
    raise exception 'All 5 spaces are full. Remove or archive a photo first.';
  end if;
  update public.profile_photos set archived_at = null, activated_at = now(), pinned = false where id = pid;
end;
$$;

-- Pin (never expires) or unpin a photo that's on your profile.
-- Unpinning gives it a fresh 30 days, so it doesn't vanish straight away.
create function public.pin_profile_photo(pid uuid, pin boolean)
returns void
language sql security definer set search_path = ''
as $$
  update public.profile_photos
  set pinned = pin, activated_at = case when pin then activated_at else now() end
  where id = pid and user_id = (select auth.uid()) and archived_at is null
    and (pinned or activated_at > now() - interval '30 days');
$$;

alter table public.profile_photos enable row level security;

-- You see all your own photos (including the Archive). Other logged-in
-- people see only current ones, unless one of you has blocked the other.
create policy profile_photos_select on public.profile_photos for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_motive_admin()
    or (
      archived_at is null and (pinned or activated_at > now() - interval '30 days')
      and not public.is_blocked_between(user_id, (select auth.uid()))
    )
  );
create policy profile_photos_delete_own on public.profile_photos for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_motive_admin());

-- Storage rules for the photo files themselves.
create policy profile_photos_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy profile_photos_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'profile-photos' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_motive_admin()));
create policy profile_photos_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-photos' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_motive_admin()
      or exists (
        select 1 from public.profile_photos p
        where p.path = name and p.archived_at is null
          and (p.pinned or p.activated_at > now() - interval '30 days')
          and not public.is_blocked_between(p.user_id, (select auth.uid()))
      )
    )
  );


-- ---------------------------------------------------------------------
-- 4. Reporting photos
-- ---------------------------------------------------------------------

create table public.profile_photo_reports (
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null references public.profile_photos (id) on delete cascade,
  reporter_id uuid default auth.uid() references public.profiles (id) on delete set null,
  reason      text not null check (char_length(reason) between 1 and 200),
  status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now()
);

alter table public.profile_photo_reports enable row level security;
create policy profile_photo_reports_insert on public.profile_photo_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open');
create policy profile_photo_reports_admin on public.profile_photo_reports for all to authenticated
  using (public.is_motive_admin()) with check (public.is_motive_admin());
