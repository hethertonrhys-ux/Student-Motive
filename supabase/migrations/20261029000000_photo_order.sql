-- Item 14: people choose the order of their profile photos (the first is
-- shown first). Only adds a column and a function.
alter table public.profile_photos add column if not exists position integer;

-- Save a new order: the ids of your photos, first to last.
create or replace function public.reorder_profile_photos(ids uuid[])
returns void
language sql security definer set search_path = ''
as $$
  update public.profile_photos p set position = o.i
  from unnest(ids) with ordinality as o(id, i)
  where p.id = o.id and p.user_id = (select auth.uid());
$$;
