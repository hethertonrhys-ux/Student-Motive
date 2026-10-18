-- =====================================================================
-- Societies imported from the students' union directories.
--
-- Only adds columns and functions, and updates the rule for what a
-- committee can edit (they can now fix their society's name). Nothing is
-- deleted or renamed.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

-- Where a society came from ('su_directory' for imported ones; empty for
-- ones added by hand), the SU page it came from, when it was imported,
-- and when its committee last edited it (the importer never overwrites a
-- society its committee has edited or claimed).
alter table public.societies add column if not exists source text;
alter table public.societies add column if not exists source_url text;
alter table public.societies add column if not exists imported_at timestamptz;
alter table public.societies add column if not exists committee_edited_at timestamptz;

-- Is anyone running this society on Function yet? (The list of who runs a
-- society is private, so the public page asks this instead.)
create or replace function public.society_is_claimed(sid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.society_admins where society_id = sid);
$$;
grant execute on function public.society_is_claimed(uuid) to anon, authenticated;

-- What app users can change on a society. Committees can now also fix
-- the name; the link, type, uni, verification and import details stay
-- with the Function team. Any committee edit is timestamped.
create or replace function public.protect_society_fields()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1
     and (select auth.uid()) is not null
     and not public.is_motive_admin() then
    new.slug := old.slug;
    new.kind := old.kind;
    new.university := old.university;
    new.is_verified := old.is_verified;
    new.source := old.source;
    new.source_url := old.source_url;
    new.imported_at := old.imported_at;
    new.committee_edited_at := now();
    new.name := coalesce(nullif(trim(new.name), ''), old.name);
  end if;
  return new;
end;
$$;
