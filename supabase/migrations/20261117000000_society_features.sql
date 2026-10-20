-- Society features (Part 1 of the Society Hub). Each society chooses which
-- tools it uses: sign-up lists, tables, the settle-up ledger, event cost,
-- member invites, event group chats and (at LSE) event admin. One row per
-- society per feature it has chosen; a feature with no row follows the
-- defaults in packages/shared/src/features.ts.
--
-- Every society with a manager when this runs (LSE Poker, UCL Chess,
-- UCL ABACUS and any other claimed society) gets every existing feature
-- switched on explicitly and Event admin switched off, so nothing changes
-- for them. Only adds things, and is safe to run more than once.

-- 1. The kind of society, picked in the Hub's setup. Committees may set it.
alter table public.societies
  add column if not exists society_type text
  check (society_type in ('social', 'sports', 'cultural', 'academic', 'games', 'arts'));

-- 2. Which features a society has switched on or off.
create table if not exists public.society_features (
  society_id uuid not null references public.societies (id) on delete cascade,
  feature_key text not null check (feature_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (society_id, feature_key)
);
alter table public.society_features enable row level security;

-- Anyone can read which features are enabled (the event page needs it,
-- logged in or not). Only the society's managers, or Function admins, can
-- add or change rows. Nothing is deleted: switching a feature off sets
-- enabled = false.
drop policy if exists society_features_select_all on public.society_features;
create policy society_features_select_all on public.society_features
  for select to anon, authenticated using (true);
drop policy if exists society_features_insert_by_admins on public.society_features;
create policy society_features_insert_by_admins on public.society_features
  for insert to authenticated with check (public.is_society_admin(society_id));
drop policy if exists society_features_update_by_admins on public.society_features;
create policy society_features_update_by_admins on public.society_features
  for update to authenticated
  using (public.is_society_admin(society_id)) with check (public.is_society_admin(society_id));

revoke all on table public.society_features from public, anon, authenticated;
-- Who changed a flag (updated_by) stays private: committee membership isn't
-- public elsewhere either.
grant select (society_id, feature_key, enabled, config, updated_at) on public.society_features to anon, authenticated;
grant insert, update on table public.society_features to authenticated;

-- Who changed a feature last, and when (null for server-side changes, and
-- once that person deletes their account).
create or replace function public.society_features_stamp()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- The profile behind updated_by was deleted (on delete set null): keep the null.
  if tg_op = 'UPDATE' and new.updated_by is null and old.updated_by is not null
     and (new.society_id, new.feature_key, new.enabled, new.config) is not distinct from
         (old.society_id, old.feature_key, old.enabled, old.config) then
    return new;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.society_features_stamp() from public, anon, authenticated;
drop trigger if exists society_features_stamp on public.society_features;
create trigger society_features_stamp before insert or update on public.society_features
  for each row execute function public.society_features_stamp();

-- 3. Is a feature on for a society? Mirrors hasFeature() in
--    packages/shared/src/features.ts for every live feature: an explicit
--    row wins; otherwise a society that hasn't picked a type keeps the six
--    existing features, and a typed society gets its type's defaults (Event
--    admin on at LSE). Coming-soon and unknown features are always off,
--    whatever rows say. Keep the two in step.
create or replace function public.society_feature_on(sid uuid, key text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when key is null or key not in ('signup_lists', 'tables', 'ledger', 'event_cost', 'member_invites', 'event_chats', 'event_admin') then false
    else coalesce(
      (select f.enabled from public.society_features f where f.society_id = sid and f.feature_key = key),
      (select case
                when key in ('member_invites', 'event_chats') then true
                when key = 'event_admin' then s.society_type is not null and s.university = 'LSE'
                when s.society_type is null then true
                when key = 'signup_lists' then s.society_type <> 'cultural'
                when key = 'event_cost' then s.society_type <> 'academic'
                else s.society_type = 'games'   -- tables, ledger
              end
       from public.societies s where s.id = sid),
      false)
  end;
$$;
-- It reveals only flags that anyone can already read.
revoke execute on function public.society_feature_on(uuid, text) from public;
grant execute on function public.society_feature_on(uuid, text) to anon, authenticated;

-- 4. Societies that already have a manager keep exactly what they have:
--    the six existing features on, Event admin off.
insert into public.society_features (society_id, feature_key, enabled)
select s.id, f.key, f.enabled
from public.societies s
cross join (values
  ('signup_lists', true), ('tables', true), ('ledger', true), ('event_cost', true),
  ('member_invites', true), ('event_chats', true), ('event_admin', false)
) as f (key, enabled)
where exists (select 1 from public.society_admins a where a.society_id = s.id)
on conflict (society_id, feature_key) do nothing;

-- 5. Event group chats switched off: new events of that society don't get a
--    chat (so there's no "Open group chat" button and nothing in Chats).
--    Chats that already exist keep working, like every other feature.
--    Copied from 20261114000000_society_event_chats.sql with that one check.
create or replace function public.event_create_chat()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.society_id is not null and not public.society_feature_on(new.society_id, 'event_chats') then
    return new;
  end if;
  insert into public.threads (event_id) values (new.id) on conflict (event_id) do nothing;
  return new;
end;
$$;
