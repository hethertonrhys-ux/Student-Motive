-- =====================================================================
-- Function TEST database setup, part 3 of 4. Paste into the SQL Editor
-- of the TEST project (function-staging) only, never the real one. Run
-- the parts in order.
--
-- The TEST project's web address contains pvldkzjrrhcnwctveemu.
-- If the address in your browser contains xrpbmcoptyrpgkdowfdt, that is
-- the REAL project: stop, and don't run anything.
--
-- How: open this file in Notepad, press Ctrl+A then Ctrl+C, go to the
-- SQL Editor, click "New query", click in the empty box, press Ctrl+V,
-- then click "Run". It takes a few seconds. When it has worked you will
-- see "Success. No rows returned". Then do part 4.
--
-- If a red error appears instead, nothing has been changed (each part
-- runs all or nothing). Take a screenshot, send it, and don't change
-- anything in this file.
--
-- This part contains these files from the app's code, unchanged, in order
-- (files 34 to 42 of 50):
--   34. 20261115000000_push_token_handover.sql
--   35. 20261116000000_security_fixes.sql
--   36. 20261117000000_society_features.sql
--   37. 20261118000000_society_claim_links.sql
--   38. 20261119000000_society_hub.sql
--   39. 20261120000000_feature_requests_founding.sql
--   40. 20261121000000_event_admin.sql
--   41. 20261122000000_event_admin_documents.sql
--   42. 20261123000000_hub_push_links.sql
--
-- Made by check/build.py from code version 4b06cc0. Don't edit by hand.
-- =====================================================================

-- Safety check first. It changes nothing; it stops the whole paste (so
-- nothing at all is changed) if this isn't the test project, or if the
-- parts are being run out of order or twice.
do $$
declare
  looks_real boolean := false;
begin
  -- 1. A real database has real accounts.
  if (select count(*) from auth.users) > 50 then
    raise exception 'STOP: this looks like your real Function database (it has real accounts). These files are only for the test project function-staging.';
  end if;
  -- 2. The real project's timers and push secret point at its own address.
  begin
    if to_regclass('cron.job') is not null then
      execute 'select exists (select 1 from cron.job where command like ''%xrpbmcoptyrpgkdowfdt%'')' into looks_real;
    end if;
    if not looks_real and to_regclass('vault.decrypted_secrets') is not null then
      execute 'select exists (select 1 from vault.decrypted_secrets where decrypted_secret like ''%xrpbmcoptyrpgkdowfdt%'')' into looks_real;
    end if;
  exception when others then
    null; -- can't look: check 1 still applies
  end;
  if looks_real then
    raise exception 'STOP: this looks like your real Function database (its timers or secrets point at the real project xrpbmcoptyrpgkdowfdt). These files are only for the test project function-staging.';
  end if;
  -- 3. Only the test project has the marker that part 1 adds at its end.
  if to_regclass('public.allowed_emails') is null then
    raise exception 'STOP: this is not the test project (part 1 of these files was never run here). Nothing was changed. Check the web address contains pvldkzjrrhcnwctveemu: if it does, part 1 was skipped, so run part 1 first; if it does not, stop, you are in the wrong project.';
  end if;
  if not exists (select 1 from public.allowed_emails where email = '@staging.studentfunction.com') then
    raise exception 'STOP: this is not the test project (part 1 of these files was never run here). Nothing was changed. Check the web address contains pvldkzjrrhcnwctveemu: if it does, part 1 was skipped, so run part 1 first; if it does not, stop, you are in the wrong project.';
  end if;
  -- 4. Part 2 must have been run first (it makes table_waitlist).
  if to_regclass('public.table_waitlist') is null then
    raise exception 'STOP: part 2 has not been run here yet, so nothing was changed. Run the parts in order: part 2 first.';
  end if;
  -- 5. This part makes society_features, so if it's already here this part has run.
  if to_regclass('public.society_features') is not null then
    raise exception 'STOP: part 3 has already been run here, so nothing was changed. Only if your browser address contains pvldkzjrrhcnwctveemu, go on to part 4; otherwise stop, you are in the wrong project.';
  end if;
end $$;

-- ===== 20261115000000_push_token_handover.sql =====
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

-- ===== 20261116000000_security_fixes.sql =====
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

-- ===== 20261117000000_society_features.sql =====
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

-- ===== 20261118000000_society_claim_links.sql =====
-- Instant claim links (Part 2 of the Society Hub). A Function admin makes a
-- one-off link for a society and sends it to the committee (usually in an
-- Instagram DM). Whoever opens it while logged in becomes a manager of that
-- one society straight away, with no request to approve.
--
-- The link's secret is 64 random characters made inside the database. Only
-- its SHA-256 hash is stored, so a leaked copy of the database can't be used
-- to claim a society. The secret is returned once, to the admin who made it,
-- and never stored or logged.
--
-- Only adds things (a table and four functions), and is safe to run more
-- than once. The existing "Claim this page" request flow is unchanged.

-- 1. The links. Only Function admins can read them, and nobody writes to
--    the table directly: every change goes through the functions below.
create table if not exists public.society_claim_links (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_by uuid references public.profiles (id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists society_claim_links_society_idx on public.society_claim_links (society_id);
alter table public.society_claim_links enable row level security;

drop policy if exists society_claim_links_select_admin on public.society_claim_links;
create policy society_claim_links_select_admin on public.society_claim_links
  for select to authenticated using (public.is_motive_admin());

revoke all on table public.society_claim_links from public, anon, authenticated;
-- Admins read everything but the hash, which nothing in the app needs.
grant select (id, society_id, created_by, created_at, expires_at, used_by, used_at, revoked_at)
  on public.society_claim_links to authenticated;

-- 2. Make a link (Function admins only). Returns the new link's id and its
--    secret, once. It works for 7 days and only once.
create or replace function public.create_society_claim_link(sid uuid)
returns table (id uuid, token text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  secret text;
  new_id uuid;
begin
  if not public.is_motive_admin() then
    raise exception 'Function admins only';
  end if;
  if sid is null or not exists (select 1 from public.societies s where s.id = sid) then
    raise exception 'Society not found';
  end if;
  -- 64 lowercase hex characters from two random UUIDs (core Postgres, no
  -- extension needed).
  secret := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
         || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
  insert into public.society_claim_links (society_id, token_hash, created_by, expires_at)
  values (sid, pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(secret, 'UTF8')), 'hex'), auth.uid(), now() + interval '7 days')
  returning public.society_claim_links.id into new_id;
  return query select new_id, secret;
end;
$$;
revoke execute on function public.create_society_claim_link(uuid) from public, anon;
grant execute on function public.create_society_claim_link(uuid) to authenticated;

-- 3. What a link is for, and whether it still works. Anyone can ask, even
--    logged out (the claim page shows the society before you log in).
--    status: 'ready', 'used', 'used_by_you' (you used it), 'expired',
--    'revoked' or 'unknown' (a malformed secret, or no such link). It never
--    says who used a link.
create or replace function public.claim_link_info(token text)
returns table (status text, society_id uuid, society_name text, society_slug text, logo_url text, university text, expires_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare
  l public.society_claim_links%rowtype;
begin
  if token is null or token !~ '^[0-9a-f]{64}$' then
    return query select 'unknown'::text, null::uuid, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  select c.* into l from public.society_claim_links c
  where c.token_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(token, 'UTF8')), 'hex');
  if not found then
    return query select 'unknown'::text, null::uuid, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  return query
  select case
           when l.revoked_at is not null then 'revoked'
           when l.used_at is not null and l.used_by = auth.uid() then 'used_by_you'
           when l.used_at is not null then 'used'
           when l.expires_at <= now() then 'expired'
           else 'ready'
         end::text,
         s.id, s.name, s.slug, s.logo_url, s.university, l.expires_at
  from public.societies s
  where s.id = l.society_id;
end;
$$;
revoke execute on function public.claim_link_info(text) from public, anon;
grant execute on function public.claim_link_info(text) to anon, authenticated;

-- 4. Use a link: in one step, mark it used (by whom, when) and make the
--    person a manager of that one society. A second use by someone else
--    fails; the same person using it again (e.g. refreshing the page) just
--    gets the society back.
--    There is deliberately no same-uni check: a Function admin chose who
--    to send the link to. It never writes to profiles, so it can never
--    change who is a Function admin.
create or replace function public.redeem_society_claim_link(token text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  l public.society_claim_links%rowtype;
begin
  if me is null then
    raise exception 'Log in first';
  end if;
  if token is null or token !~ '^[0-9a-f]{64}$' then
    raise exception 'This link isn''t valid';
  end if;
  -- Lock the link so two people opening it at once can't both claim it.
  select c.* into l from public.society_claim_links c
  where c.token_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(token, 'UTF8')), 'hex')
  for update;
  if not found then
    raise exception 'This link isn''t valid';
  end if;
  if l.revoked_at is not null then
    raise exception 'This link has been cancelled';
  end if;
  if l.used_at is not null then
    if l.used_by = me then
      return l.society_id;
    end if;
    raise exception 'This link has already been used';
  end if;
  if l.expires_at <= now() then
    raise exception 'This link has expired';
  end if;

  update public.society_claim_links c set used_by = me, used_at = now() where c.id = l.id;
  insert into public.society_admins (society_id, user_id) values (l.society_id, me)
  on conflict do nothing;
  -- A "Claim this page" request they had already sent is now done.
  update public.society_claims c set status = 'approved', reviewed_at = now()
  where c.society_id = l.society_id and c.user_id = me and c.status = 'pending';
  return l.society_id;
end;
$$;
revoke execute on function public.redeem_society_claim_link(text) from public, anon;
grant execute on function public.redeem_society_claim_link(text) to authenticated;

-- 5. Cancel a link that hasn't been used (Function admins only).
create or replace function public.revoke_society_claim_link(link_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_motive_admin() then
    raise exception 'Function admins only';
  end if;
  update public.society_claim_links c set revoked_at = now()
  where c.id = link_id and c.used_at is null and c.revoked_at is null;
end;
$$;
revoke execute on function public.revoke_society_claim_link(uuid) from public, anon;
grant execute on function public.revoke_society_claim_link(uuid) to authenticated;

-- ===== 20261119000000_society_hub.sql =====
-- The Society Hub (Part 3): the committee's home for running their society
-- on Function, and the setup wizard a committee goes through after claiming
-- it (check the page, pick a type and features, the Founding Society
-- agreement, invite the committee, post the first event).
--
-- Adds:
--   - societies.is_founding (only Function admins can change it) and
--     societies.onboarded_at (set when the committee finishes the setup).
--   - founding_agreements: a Founding Society's "We're in".
--   - feature_interest: coming-soon features a society has said it wants.
--   - society_manager_invites: committee members invited by email before
--     they have an account; they become managers as soon as they sign up.
--   - Functions to list, add, invite and remove managers. Managers see each
--     other's names, never emails, and nothing here writes to profiles, so
--     no one can make anyone a Function admin.
--   - A new push kind, 'hub' ("Society Hub" in notification settings).
--
-- Only adds things (nothing is dropped, renamed or deleted), and is safe to
-- run more than once. Societies already on Function see no change: their
-- features and events stay exactly as they are.

-- ---------------------------------------------------------------------
-- 1. Founding Societies and finishing the setup
-- ---------------------------------------------------------------------

alter table public.societies add column if not exists is_founding boolean not null default false;
alter table public.societies add column if not exists onboarded_at timestamptz;

-- What app users can change on a society. Copied from
-- 20261106000000_society_import.sql (the latest definition) with one line
-- added: committees can't make their society a Founding Society (only the
-- Function team can). Committees may still set society_type and
-- onboarded_at.
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
    new.is_founding := old.is_founding;
    new.committee_edited_at := now();
    new.name := coalesce(nullif(trim(new.name), ''), old.name);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. The Founding Society agreement
-- ---------------------------------------------------------------------

-- One row per Founding Society that has said "We're in". Only that
-- society's managers (and Function admins) can read it; nobody writes to it
-- directly (agree_to_founding below does).
create table if not exists public.founding_agreements (
  society_id uuid primary key references public.societies (id) on delete cascade,
  agreed_by uuid references public.profiles (id) on delete set null default auth.uid(),
  agreed_at timestamptz not null default now(),
  events_target integer not null default 3 check (events_target between 1 and 20)
);
alter table public.founding_agreements enable row level security;

drop policy if exists founding_agreements_select on public.founding_agreements;
create policy founding_agreements_select on public.founding_agreements
  for select to authenticated using (public.is_society_admin(society_id));

revoke all on table public.founding_agreements from public, anon, authenticated;
grant select on table public.founding_agreements to authenticated;

-- "We're in": a manager of a Founding Society agrees (or a Function admin
-- on their behalf). Agreeing again changes nothing.
create or replace function public.agree_to_founding(sid uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if sid is null or not (public.is_society_committee(sid) or public.is_motive_admin()) then
    raise exception 'Only the society''s managers can do this';
  end if;
  if not exists (select 1 from public.societies s where s.id = sid and s.is_founding) then
    raise exception 'This society isn''t a Founding Society';
  end if;
  insert into public.founding_agreements (society_id, agreed_by)
  values (sid, auth.uid())
  on conflict (society_id) do nothing;
end;
$$;
revoke execute on function public.agree_to_founding(uuid) from public, anon;
grant execute on function public.agree_to_founding(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Coming-soon features a society wants ("We want this")
-- ---------------------------------------------------------------------

create table if not exists public.feature_interest (
  society_id uuid not null references public.societies (id) on delete cascade,
  feature_key text not null check (feature_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (society_id, feature_key)
);
alter table public.feature_interest enable row level security;

-- The society's managers (and Function admins) see, add and remove their
-- own society's wishes. Logged-out visitors get nothing.
drop policy if exists feature_interest_select on public.feature_interest;
create policy feature_interest_select on public.feature_interest
  for select to authenticated using (public.is_society_admin(society_id));
drop policy if exists feature_interest_insert on public.feature_interest;
create policy feature_interest_insert on public.feature_interest
  for insert to authenticated
  with check (public.is_society_admin(society_id) and created_by = (select auth.uid()));
drop policy if exists feature_interest_delete on public.feature_interest;
create policy feature_interest_delete on public.feature_interest
  for delete to authenticated using (public.is_society_admin(society_id));

revoke all on table public.feature_interest from public, anon, authenticated;
grant select, insert, delete on table public.feature_interest to authenticated;

-- ---------------------------------------------------------------------
-- 4. Committee members invited by email before they have an account
-- ---------------------------------------------------------------------

create table if not exists public.society_manager_invites (
  society_id uuid not null references public.societies (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  invited_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (society_id, email)
);
alter table public.society_manager_invites enable row level security;

-- The society's managers see the emails they invited and can cancel them.
-- New invites only come through invite_society_manager below.
drop policy if exists society_manager_invites_select on public.society_manager_invites;
create policy society_manager_invites_select on public.society_manager_invites
  for select to authenticated using (public.is_society_admin(society_id));
drop policy if exists society_manager_invites_delete on public.society_manager_invites;
create policy society_manager_invites_delete on public.society_manager_invites
  for delete to authenticated using (public.is_society_admin(society_id));

revoke all on table public.society_manager_invites from public, anon, authenticated;
grant select, delete on table public.society_manager_invites to authenticated;

-- When someone's profile is made (they've just signed up), any manager
-- invites for their email make them a manager of those societies, and the
-- invites are used up. handle_new_user is unchanged; this is a separate
-- trigger on profiles.
create or replace function public.redeem_manager_invites()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is null or new.email = '' then
    return new;
  end if;
  insert into public.society_admins (society_id, user_id)
  select i.society_id, new.id
  from public.society_manager_invites i
  where i.email = lower(new.email)
  on conflict do nothing;
  delete from public.society_manager_invites i where i.email = lower(new.email);
  return new;
end;
$$;
revoke execute on function public.redeem_manager_invites() from public, anon, authenticated;
drop trigger if exists profiles_redeem_manager_invites on public.profiles;
create trigger profiles_redeem_manager_invites after insert on public.profiles
  for each row execute function public.redeem_manager_invites();

-- ---------------------------------------------------------------------
-- 5. A new kind of push: "hub" (news about societies you run)
-- ---------------------------------------------------------------------

alter table public.notification_settings add column if not exists hub boolean not null default true;
alter table public.push_queue drop constraint if exists push_queue_kind_check;
alter table public.push_queue add constraint push_queue_kind_check
  check (kind in ('messages', 'friends', 'society_events', 'reminders', 'hosting', 'seating', 'hub'));

-- Copied from 20261113000000_poker_seats.sql (the latest definition) with
-- the 'hub' kind added.
create or replace function public.queue_push(target uuid, kind text, title text, body text, url text default null, dedupe text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  wanted boolean;
begin
  if target is null then return; end if;
  select case kind
           when 'messages' then s.messages
           when 'friends' then s.friends
           when 'society_events' then s.society_events
           when 'reminders' then s.reminders
           when 'hosting' then s.hosting
           when 'seating' then s.seating
           when 'hub' then s.hub
         end
    into wanted
    from public.notification_settings s where s.user_id = target;
  if coalesce(wanted, true) is false then return; end if;
  -- Only people who have allowed notifications somewhere get rows at all.
  if not exists (select 1 from public.push_tokens t where t.user_id = target) then return; end if;
  insert into public.push_queue (user_id, kind, title, body, url, dedupe_key)
  values (target, kind, left(title, 120), left(body, 200), url, dedupe)
  on conflict (dedupe_key) do nothing;
end;
$$;
-- Still server-only (as set by 20261116000000_security_fixes.sql): only
-- other database functions may queue pushes.
revoke execute on function public.queue_push(uuid, text, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. The society's managers
-- ---------------------------------------------------------------------

-- Who manages a society: names and photos, never emails. Only for the
-- society's managers and Function admins (anyone else gets no rows).
-- Names as elsewhere: the display name, else the full name, else 'Member'.
create or replace function public.society_managers(sid uuid)
returns table (user_id uuid, name text, avatar_url text, is_me boolean, added_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select a.user_id,
         coalesce(nullif(p.display_name, ''), nullif(p.full_name, ''), 'Member'),
         p.avatar_url,
         coalesce(a.user_id = auth.uid(), false),
         a.created_at
  from public.society_admins a
  join public.profiles p on p.id = a.user_id
  where a.society_id = sid and public.is_society_admin(sid)
  order by a.created_at, a.user_id
$$;
revoke execute on function public.society_managers(uuid) from public, anon;
grant execute on function public.society_managers(uuid) to authenticated;

-- A manager adds someone (found by name) as another manager. They get a
-- Society Hub push. Never writes to profiles, so it can't make anyone a
-- Function admin.
create or replace function public.add_society_manager(sid uuid, person uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  sname text;
begin
  if sid is null or not (public.is_society_committee(sid) or public.is_motive_admin()) then
    raise exception 'Only the society''s managers can do this';
  end if;
  select s.name into sname from public.societies s where s.id = sid;
  if sname is null then
    raise exception 'Society not found';
  end if;
  -- Nobody can be made a manager by someone they've blocked, or who has
  -- blocked them. Same wording as a refused friend request.
  if public.is_blocked_between(auth.uid(), person) then
    raise exception 'You can''t add this person';
  end if;
  if person is null or not exists (select 1 from public.profiles p where p.id = person) then
    raise exception 'That person isn''t on Function';
  end if;
  insert into public.society_admins (society_id, user_id) values (sid, person)
  on conflict do nothing;
  -- Only someone newly added is told (and never the person adding themselves).
  -- The push opens the society's dashboard, which every app build has: app
  -- builds already in the stores have no Hub screens, and a tap on a phone
  -- opens the link inside the app. Switch it to '/hub/' || sid once an app
  -- build with the Hub is out.
  if found and person is distinct from auth.uid() then
    perform public.queue_push(person, 'hub', 'You''re now a manager of ' || sname, 'Open Function to see it.',
                              '/dashboard/' || sid, 'manager-added:' || sid || ':' || person);
  end if;
end;
$$;
revoke execute on function public.add_society_manager(uuid, uuid) from public, anon;
grant execute on function public.add_society_manager(uuid, uuid) to authenticated;

-- A manager adds someone by email. If that email has an account they're
-- added straight away ('added'); otherwise the invite is kept and they
-- become a manager when they sign up ('invited').
-- Decision: the answer shows whether that email has an account. That's
-- acceptable here: only a society's managers can ask, and they're adding
-- someone they know to their own committee.
create or replace function public.invite_society_manager(sid uuid, address text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  e text := lower(trim(coalesce(address, '')));
  person uuid;
begin
  if sid is null or not (public.is_society_committee(sid) or public.is_motive_admin()) then
    raise exception 'Only the society''s managers can do this';
  end if;
  if length(e) > 254 or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That doesn''t look like an email address';
  end if;
  select p.id into person from public.profiles p where p.email = e limit 1;
  if person is not null then
    perform public.add_society_manager(sid, person);
    return 'added';
  end if;
  -- Only emails that can sign up are kept (the same rule as sign-up: a
  -- London uni email, or one the Function team has allowed), so nobody is
  -- told an invite will work when it never can.
  if public.uni_from_email(e) is null and not exists (
       select 1 from public.allowed_emails a
       where a.email = e or (a.email like '@%' and e like '%' || a.email)) then
    raise exception 'Use their uni email: only uni students can sign up';
  end if;
  insert into public.society_manager_invites (society_id, email, invited_by)
  values (sid, e, auth.uid())
  on conflict (society_id, email) do nothing;
  return 'invited';
end;
$$;
revoke execute on function public.invite_society_manager(uuid, text) from public, anon;
grant execute on function public.invite_society_manager(uuid, text) to authenticated;

-- A manager removes themselves (the committee handover: next year's
-- committee is added first, then the current managers step down). A
-- society always keeps at least one manager.
create or replace function public.leave_society_management(sid uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or sid is null or not public.is_society_committee(sid) then
    raise exception 'Only the society''s managers can do this';
  end if;
  -- Lock the society so two managers leaving at the same moment can't
  -- leave it with none.
  perform 1 from public.societies s where s.id = sid for update;
  if (select count(*) from public.society_admins a where a.society_id = sid) <= 1 then
    raise exception 'You''re the last manager. Add someone else first, then remove yourself.';
  end if;
  delete from public.society_admins a where a.society_id = sid and a.user_id = me;
end;
$$;
revoke execute on function public.leave_society_management(uuid) from public, anon;
grant execute on function public.leave_society_management(uuid) to authenticated;

-- ===== 20261120000000_feature_requests_founding.sql =====
-- Feature requests, Founding Society progress and the Function team's Hub
-- view (Part 4 of the Society Hub).
--
-- Adds:
--   - feature_requests: a society's committee asks for a feature ("What do
--     you need? How do you do it now?"). The committee sees and adds its own
--     society's requests; only Function admins see them all and change
--     their status. Setting a request to 'live' sends the society's managers
--     a Society Hub push.
--   - Founding Society progress, worked out from the society's events (never
--     stored): events posted since agreeing, prize-draw eligibility, and
--     whether the Founding Society badge is on.
--   - Lists for the Function team: the requests queue, the coming-soon
--     features ranked by how many societies want each, and every Founding
--     Society's progress.
--   - queue_hub_reminders(): a weekly nudge for Founding Societies that
--     haven't posted for 7 days. Run daily by supabase/RUN_ONCE_hub_cron.sql.
--
-- Only adds things (nothing is dropped, renamed or deleted), and is safe to
-- run more than once. Societies already on Function see no change: none of
-- them is a Founding Society, so no badge, progress or nudge applies to them.

-- ---------------------------------------------------------------------
-- 1. Feature requests
-- ---------------------------------------------------------------------

create table if not exists public.feature_requests (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies (id) on delete cascade,
  requested_by uuid references public.profiles (id) on delete set null default auth.uid(),
  need text not null check (length(trim(need)) between 3 and 1000),
  current_process text check (current_process is null or length(current_process) <= 1000),
  status text not null default 'new' check (status in ('new', 'building', 'live', 'declined')),
  admin_note text check (admin_note is null or length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status_changed_at timestamptz
);
create index if not exists feature_requests_status_idx on public.feature_requests (status, created_at);
create index if not exists feature_requests_society_idx on public.feature_requests (society_id, created_at);
alter table public.feature_requests enable row level security;

-- The society's own managers (not every Function admin through
-- is_society_admin, though admins see everything anyway) read their
-- society's requests and add new ones in their own name. Only Function
-- admins change or delete them.
drop policy if exists feature_requests_select on public.feature_requests;
create policy feature_requests_select on public.feature_requests
  for select to authenticated
  using (public.is_society_committee(society_id) or public.is_motive_admin());
drop policy if exists feature_requests_insert on public.feature_requests;
create policy feature_requests_insert on public.feature_requests
  for insert to authenticated
  with check (public.is_society_committee(society_id) and requested_by = (select auth.uid())
              and status = 'new' and admin_note is null);
drop policy if exists feature_requests_update on public.feature_requests;
create policy feature_requests_update on public.feature_requests
  for update to authenticated
  using (public.is_motive_admin()) with check (public.is_motive_admin());
drop policy if exists feature_requests_delete on public.feature_requests;
create policy feature_requests_delete on public.feature_requests
  for delete to authenticated using (public.is_motive_admin());

revoke all on table public.feature_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.feature_requests to authenticated;

-- Dates are the server's: a new request starts now (whatever the app
-- sent), and every change stamps updated_at, plus status_changed_at when the
-- status changes. Who asked, for which society and when never change for
-- people using the app (the database's own scripts, with no logged-in user,
-- are left alone). Only changes made directly count as "from the app"
-- (pg_trigger_depth() = 1): when someone deletes their account, the
-- database itself clears requested_by on their requests, and that must go
-- through.
create or replace function public.feature_requests_stamp()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if pg_trigger_depth() = 1 and (select auth.uid()) is not null then
      new.created_at := now();
      new.updated_at := now();
      new.status_changed_at := null;
    end if;
    return new;
  end if;
  new.updated_at := now();
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  if pg_trigger_depth() = 1 and (select auth.uid()) is not null then
    new.id := old.id;
    new.society_id := old.society_id;
    new.requested_by := old.requested_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
revoke execute on function public.feature_requests_stamp() from public, anon, authenticated;
drop trigger if exists feature_requests_stamp on public.feature_requests;
create trigger feature_requests_stamp before insert or update on public.feature_requests
  for each row execute function public.feature_requests_stamp();

-- A request goes live: every manager of that society gets a Society Hub
-- push, once per request (the dedupe key stops repeats if it goes back and
-- forth). The push opens the society's dashboard, which every app build has:
-- app builds already in the stores have no Hub screens, and a tap on a
-- phone opens the link inside the app. Switch it to
-- '/hub/' || society_id || '/requests' once an app build with the Hub is out.
create or replace function public.push_on_request_live()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  manager uuid;
begin
  for manager in select a.user_id from public.society_admins a where a.society_id = new.society_id loop
    perform public.queue_push(manager, 'hub', 'Your feature request is live', left(new.need, 100),
                              '/dashboard/' || new.society_id, 'request-live:' || new.id || ':' || manager);
  end loop;
  return null;
end;
$$;
revoke execute on function public.push_on_request_live() from public, anon, authenticated;
drop trigger if exists feature_requests_push_live on public.feature_requests;
create trigger feature_requests_push_live after update of status on public.feature_requests
  for each row when (new.status = 'live' and old.status is distinct from 'live')
  execute function public.push_on_request_live();

-- ---------------------------------------------------------------------
-- 2. Founding Society progress (worked out, never stored)
-- ---------------------------------------------------------------------
--
-- Definitions (packages/shared/src/founding.ts follows the same ones; keep
-- the two in step):
--   - A "published event" is an event of the society that isn't cancelled
--     and isn't hidden by the Function team. society_published_events() is
--     the one place this is decided (Part 5 also leaves out drafts there).
--   - "Events posted since agreeing": published events created at or after
--     the Founding Society agreement (agreed_at).
--   - "Prize-draw eligible": at least events_target (3) of those, each with
--     at least one person going.
--   - "Last event": the newest created_at among the society's published
--     events (any time, before agreeing too).
--   - "Badge on": a Founding Society that has agreed, and whose last event or
--     agreement (whichever is later) is less than 30 days old. So the badge
--     turns off after 30 days without a new published event, and comes back
--     as soon as they post again.

-- Every number above comes from events.created_at, so people using the app
-- can't set it: a new event is created now (whatever the app sent), and
-- created_at never changes after that. Otherwise a manager could keep the
-- badge on for good or move old events into "since agreeing". This is the
-- 20261020000000_social.sql version with the two created_at lines added (the
-- app never sends created_at); the events_protect_fields trigger already
-- uses it, and its grants stay as they are. Part 5 must keep both lines
-- when it changes this function.
create or replace function public.protect_event_fields()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1
     and (select auth.uid()) is not null
     and not public.is_motive_admin() then
    if tg_op = 'INSERT' then
      new.is_hidden := false;
      new.going_count := 0;
      new.created_by := (select auth.uid());
      new.created_at := now();
    else
      new.is_hidden := old.is_hidden;
      new.going_count := old.going_count;
      new.created_by := old.created_by;
      new.society_id := old.society_id;
      new.host_user_id := old.host_user_id;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;

-- The society's published events. Server-only: other database functions
-- use it; nobody calls it from the app.
create or replace function public.society_published_events(sid uuid)
returns table (id uuid, created_at timestamptz, starts_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select e.id, e.created_at, e.starts_at
  from public.events e
  where e.society_id = sid
    and not e.is_cancelled
    and not e.is_hidden
$$;
revoke execute on function public.society_published_events(uuid) from public, anon, authenticated;

-- Everything about one society's Founding progress, for any society (zeros
-- and nulls when it isn't Founding or hasn't agreed). No rows if the
-- society doesn't exist. Server-only: founding_progress,
-- founding_badge_active, admin_founding_societies and queue_hub_reminders
-- decide who sees what.
create or replace function public.founding_status(sid uuid)
returns table (is_founding boolean, agreed_at timestamptz, events_target integer, events_since integer,
               events_with_rsvp integer, last_event_at timestamptz, days_since_last_event integer,
               eligible boolean, badge_active boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  founding boolean;
  agreed timestamptz;
  target integer;
  since integer := 0;
  with_rsvp integer := 0;
  last_at timestamptz;
begin
  select s.is_founding, a.agreed_at, coalesce(a.events_target, 3)
    into founding, agreed, target
    from public.societies s
    left join public.founding_agreements a on a.society_id = s.id
   where s.id = sid;
  if not found then
    return;
  end if;
  select max(e.created_at) into last_at from public.society_published_events(sid) e;
  if agreed is not null then
    select count(*)::integer,
           (count(*) filter (where exists (select 1 from public.event_entries x
                                           where x.event_id = e.id and x.status = 'going')))::integer
      into since, with_rsvp
      from public.society_published_events(sid) e
     where e.created_at >= agreed;
  end if;
  return query select
    founding,
    agreed,
    target,
    since,
    with_rsvp,
    last_at,
    case when last_at is null then null else floor(extract(epoch from (now() - last_at)) / 86400)::integer end,
    coalesce(founding and agreed is not null and with_rsvp >= target, false),
    coalesce(founding and agreed is not null and greatest(last_at, agreed) > now() - interval '30 days', false);
end;
$$;
revoke execute on function public.founding_status(uuid) from public, anon, authenticated;

-- Whether a society's page shows the Founding Society badge. Anyone may ask
-- (logged out too): it says nothing but the badge.
create or replace function public.founding_badge_active(sid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select f.badge_active from public.founding_status(sid) f), false)
$$;
revoke execute on function public.founding_badge_active(uuid) from public;
grant execute on function public.founding_badge_active(uuid) to anon, authenticated;

-- The Hub's progress card: only the society's managers (and Function
-- admins); anyone else gets no rows.
create or replace function public.founding_progress(sid uuid)
returns table (is_founding boolean, agreed_at timestamptz, events_target integer, events_since integer,
               events_with_rsvp integer, last_event_at timestamptz, days_since_last_event integer,
               eligible boolean, badge_active boolean)
language sql stable security definer set search_path = ''
as $$
  select f.is_founding, f.agreed_at, f.events_target, f.events_since, f.events_with_rsvp,
         f.last_event_at, f.days_since_last_event, f.eligible, f.badge_active
  from public.founding_status(sid) f
  where public.is_society_admin(sid)
$$;
revoke execute on function public.founding_progress(uuid) from public, anon;
grant execute on function public.founding_progress(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. The Function team's Hub view (admins only)
-- ---------------------------------------------------------------------

-- Every Founding Society (agreed or not; agreed_at is null until they have)
-- with its progress.
create or replace function public.admin_founding_societies()
returns table (society_id uuid, name text, slug text, university text, agreed_at timestamptz,
               events_target integer, events_since integer, events_with_rsvp integer,
               last_event_at timestamptz, days_since_last_event integer, eligible boolean, badge_active boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_motive_admin() then
    raise exception 'Function admins only';
  end if;
  return query
    select s.id, s.name, s.slug, s.university, f.agreed_at, f.events_target, f.events_since,
           f.events_with_rsvp, f.last_event_at, f.days_since_last_event, f.eligible, f.badge_active
    from public.societies s
    cross join lateral public.founding_status(s.id) f
    where s.is_founding
    order by s.name, s.id;
end;
$$;
revoke execute on function public.admin_founding_societies() from public, anon;
grant execute on function public.admin_founding_societies() to authenticated;

-- The features societies have said "We want this" to, most wanted first.
create or replace function public.admin_feature_interest()
returns table (feature_key text, societies integer, society_names text[])
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_motive_admin() then
    raise exception 'Function admins only';
  end if;
  return query
    select i.feature_key, count(*)::integer, array_agg(s.name order by s.name)
    from public.feature_interest i
    join public.societies s on s.id = i.society_id
    group by i.feature_key
    order by count(*) desc, i.feature_key;
end;
$$;
revoke execute on function public.admin_feature_interest() from public, anon;
grant execute on function public.admin_feature_interest() to authenticated;

-- The requests queue, newest first, optionally one status only. Who asked is
-- a name (as elsewhere: the display name, else the full name, else
-- 'Member'), never an email; null if their account has been deleted.
create or replace function public.admin_feature_requests(status_filter text default null)
returns table (id uuid, society_id uuid, society_name text, society_slug text, university text, need text,
               current_process text, status text, admin_note text, created_at timestamptz,
               status_changed_at timestamptz, requested_by_name text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_motive_admin() then
    raise exception 'Function admins only';
  end if;
  return query
    select r.id, r.society_id, s.name, s.slug, s.university, r.need, r.current_process, r.status,
           r.admin_note, r.created_at, r.status_changed_at,
           case when p.id is null then null
                else coalesce(nullif(p.display_name, ''), nullif(p.full_name, ''), 'Member') end
    from public.feature_requests r
    join public.societies s on s.id = r.society_id
    left join public.profiles p on p.id = r.requested_by
    where status_filter is null or r.status = status_filter
    order by r.created_at desc, r.id
    limit 500;
end;
$$;
revoke execute on function public.admin_feature_requests(text) from public, anon;
grant execute on function public.admin_feature_requests(text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Reminders (run daily by supabase/RUN_ONCE_hub_cron.sql)
-- ---------------------------------------------------------------------

-- Founding Societies that have agreed but haven't posted a new event (or
-- agreed) for more than 7 days: each manager gets a Society Hub push, at
-- most once every 7 days per manager and society (a nudge is skipped if one
-- went in the last six and a half days; the dedupe key also has the week in
-- it, which stops repeats on the same day). Returns how many
-- pushes were queued. Server-only. Part 5 adds the event admin reminders
-- here too.
-- The push opens the society's dashboard, which every app build has (app
-- builds in the stores have no Hub screens yet). Switch it to '/hub/' ||
-- society id once an app build with the Hub is out.
create or replace function public.queue_hub_reminders()
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r record;
  manager uuid;
  k text;
  queued integer := 0;
  week bigint := floor(extract(epoch from now()) / 604800)::bigint;
begin
  for r in
    select s.id, f.events_since, f.events_target
    from public.societies s
    cross join lateral public.founding_status(s.id) f
    where s.is_founding
      and f.agreed_at is not null
      and greatest(f.last_event_at, f.agreed_at) < now() - interval '7 days'
  loop
    for manager in select a.user_id from public.society_admins a where a.society_id = r.id loop
      k := 'founding-nudge:' || r.id || ':' || manager || ':' || week;
      continue when exists (select 1 from public.push_queue q where q.dedupe_key = k);
      continue when exists (select 1 from public.push_queue q
                            where q.user_id = manager
                              and q.dedupe_key like 'founding-nudge:' || r.id || ':' || manager || ':%'
                              and q.created_at > now() - interval '6 days 12 hours');
      perform public.queue_push(manager, 'hub', 'Time to post your next event?',
                                least(r.events_since, r.events_target) || ' of ' || r.events_target
                                  || ' events posted. Post your next one to keep your Founding badge.',
                                '/dashboard/' || r.id, k);
      if exists (select 1 from public.push_queue q where q.dedupe_key = k) then
        queued := queued + 1;
      end if;
    end loop;
  end loop;
  return queued;
end;
$$;
revoke execute on function public.queue_hub_reminders() from public, anon, authenticated;

-- ===== 20261121000000_event_admin.sql =====
-- Event admin (Part 5 of the Society Hub): draft events, the committee's
-- answers about each event (which decide the SU paperwork Function
-- prepares for them to check and submit), and the LSE approval gate.
--
-- Adds:
--   - events.is_draft: a draft is visible only to the society's managers
--     (and Function admins), or to the student hosting it. Every database
--     function that lists, counts, notifies about or lets people join
--     events leaves drafts out. Publishing a draft sends the "new event"
--     push then (once: the same dedupe keys as when an event is posted).
--   - events.published_at: when an event was first published, set by the
--     server. Founding progress and Notifications date an event by it, so a
--     draft published weeks later counts from when it went live.
--   - event_admin: one row per event with the committee's answers, the
--     form, the submit-by date, the checklist and "SU approved". Only that
--     society's managers (and Function admins) can see or change it.
--   - The approval gate: for an LSE society with Event admin on, an event
--     goes live only once a manager has ticked "SU approved". So for those
--     societies a new event starts as a draft. Events already published are
--     never affected, and switching the feature on later unpublishes nothing.
--
-- Only adds things (nothing is dropped, renamed or deleted) and is safe to
-- run more than once. Every existing event stays published (is_draft
-- defaults to false), and every society already on Function has Event
-- admin off (20261117000000_society_features.sql), so none of them sees a
-- change. Functions below are copied from their latest versions with only
-- the draft condition added; create or replace keeps their grants.

-- ---------------------------------------------------------------------
-- 1. Draft events
-- ---------------------------------------------------------------------

alter table public.events add column if not exists is_draft boolean not null default false;

-- Who can see an event: as in 20261104000000_london_unis.sql, and a draft
-- only by the society's managers (and Function admins) or its host.
alter policy events_select_visible on public.events
  using (
    (not is_hidden
      or (society_id is not null and public.is_society_admin(society_id))
      or host_user_id = (select auth.uid()))
    and (
      host_user_id is null
      or (
        not public.is_blocked_between(host_user_id, (select auth.uid()))
        and (visibility = 'public'
          or host_user_id = (select auth.uid())
          or public.are_friends(host_user_id, (select auth.uid()))
          or public.has_entry(id))
      )
    )
    and (
      society_id is null
      or public.can_see_society_event(society_id, audience)
      or public.has_entry(id)
    )
    and (not is_draft
      or (society_id is not null and public.is_society_admin(society_id))
      or host_user_id = (select auth.uid()))
  );

-- When an event was first published. Every event already published was
-- published when it was created. The backfill leaves updated_at alone, so
-- existing events don't change at all.
alter table public.events add column if not exists published_at timestamptz;
alter table public.events disable trigger events_set_updated_at;
update public.events set published_at = created_at where published_at is null and not is_draft;
alter table public.events enable trigger events_set_updated_at;

-- Set by the server only, whatever the app sends: null while an event has
-- never been published; when it's published, now (or, for one published
-- straight away, when it was created); after that it never moves, even if
-- it's unpublished and published again, so it can't be gamed. For an event
-- published straight away it stays equal to created_at, which only Function
-- admins and the database's own scripts can change (protect_event_fields). Before
-- triggers run in name order, so this one ("events_track_published") runs
-- after events_protect_fields has fixed created_at and after the approval
-- gate (events_su_approval_gate) has had its say.
create or replace function public.events_stamp_published()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.is_draft then
    new.published_at := case when tg_op = 'UPDATE' then old.published_at else null end;
  elsif tg_op = 'INSERT' then
    new.published_at := new.created_at;
  elsif old.published_at is null then
    new.published_at := now();
  elsif old.published_at = old.created_at then
    new.published_at := new.created_at;
  else
    new.published_at := old.published_at;
  end if;
  return new;
end;
$$;
revoke execute on function public.events_stamp_published() from public, anon, authenticated;
drop trigger if exists events_track_published on public.events;
create trigger events_track_published before insert or update on public.events
  for each row execute function public.events_stamp_published();

-- Whether an event is a draft, for the policy below (security definer, so
-- it answers even for people who can't see the draft).
create or replace function public.event_is_draft(eid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select e.is_draft from public.events e where e.id = eid), false) $$;
revoke execute on function public.event_is_draft(uuid) from public, anon;
grant execute on function public.event_is_draft(uuid) to authenticated;

-- Who's on an event (20261017000000_members_formats_ledger.sql): as
-- before, but a draft's list only for the society's managers (and Function
-- admins). People added to a draft still see their own entry.
alter policy event_entries_select on public.event_entries
  using (
    user_id = (select auth.uid())
    or (public.is_society_member(public.event_society(event_id))
        and (not public.event_is_draft(event_id) or public.is_society_admin(public.event_society(event_id))))
  );

-- ---------------------------------------------------------------------
-- 2. Functions that list, count, notify about or join events skip drafts
-- ---------------------------------------------------------------------

-- Joining (20261020000000_social.sql): a draft can't be joined.
create or replace function public.join_event(eid uuid, tid uuid default null)
returns public.entry_status
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  ev public.events;
  result public.entry_status;
begin
  if uid is null then raise exception 'Log in first'; end if;
  select * into ev from public.events where id = eid for update;
  if not found or ev.is_hidden or ev.is_cancelled then raise exception 'This event isn''t available'; end if;
  if ev.is_draft then raise exception 'This event isn''t published yet'; end if;
  if ev.ends_at < now() then raise exception 'This event has finished'; end if;
  if ev.members_only and ev.society_id is not null and not public.is_society_member(ev.society_id) then
    raise exception 'Only members of this society can join';
  end if;
  -- Hosts run their own event; they don't take a place on the guest list.
  if ev.host_user_id = uid then raise exception 'You''re the host'; end if;
  if ev.host_user_id is not null then
    if public.is_blocked_between(ev.host_user_id, uid) then raise exception 'This event isn''t available'; end if;
    if ev.visibility = 'friends' and not public.are_friends(ev.host_user_id, uid)
       and not exists (select 1 from public.event_entries where event_id = eid and user_id = uid) then
      raise exception 'Only the host''s friends can join';
    end if;
  end if;

  select status into result from public.event_entries where event_id = eid and user_id = uid;
  if found then
    if tid is not null then perform public.choose_table(eid, tid); end if;
    return result;
  end if;

  result := 'going';
  if ev.host_user_id is not null and ev.join_mode = 'approval' then
    result := 'requested';
  elsif ev.format = 'entries' and ev.capacity is not null
     and (select count(*) from public.event_entries where event_id = eid and status = 'going') >= ev.capacity then
    result := 'waitlist';
  end if;

  if tid is not null then
    if ev.format <> 'tables' then raise exception 'This event doesn''t have tables'; end if;
    perform public.assert_seat_free(eid, tid);
  end if;

  insert into public.event_entries (event_id, user_id, status, table_id) values (eid, uid, result, tid);
  return result;
end;
$$;

-- "Starting soon" reminders (20261109000000_push_notifications.sql): none
-- for drafts. Still server-only (20261116000000_security_fixes.sql).
create or replace function public.queue_event_reminders()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer := 0;
  r record;
  when_text text;
begin
  for r in
    select e.id, e.title, e.starts_at, en.user_id, '/e/' || e.id as url
    from public.events e join public.event_entries en on en.event_id = e.id and en.status = 'going'
    where not e.is_cancelled and not e.is_hidden and not e.is_draft and e.starts_at between now() + interval '30 minutes' and now() + interval '35 minutes'
    union all
    select se.id, se.title, se.starts_at, m.user_id, '/social/' || se.id
    from public.social_events se join public.social_event_members m on m.event_id = se.id and m.status = 'going'
    where not se.is_cancelled and not se.is_hidden and se.starts_at between now() + interval '30 minutes' and now() + interval '35 minutes'
    union all
    select se.id, se.title, se.starts_at, se.host_id, '/social/' || se.id
    from public.social_events se
    where not se.is_cancelled and not se.is_hidden and se.starts_at between now() + interval '30 minutes' and now() + interval '35 minutes'
  loop
    when_text := to_char(r.starts_at at time zone 'Europe/London', 'HH24:MI');
    perform public.queue_push(r.user_id, 'reminders', 'Starting soon: ' || r.title, 'Starts at ' || when_text || '.', r.url, 'reminder:' || r.id || ':' || r.user_id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.queue_event_reminders() from public;
revoke execute on function public.queue_event_reminders() from public, anon, authenticated;

-- Friends hosting or going (20261110000000_recommendations.sql): no counts for drafts.
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
      and not e.is_hidden and not e.is_cancelled and not e.is_draft
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

-- The chat list (20261114000000_society_event_chats.sql): a draft's chat
-- only shows for the society's committee (or the student hosting it).
create or replace function public.my_threads()
returns table (
  id uuid, event_id uuid, title text, other_id uuid, other_name text, other_avatar text,
  last_body text, last_at timestamptz, last_sender uuid, unread bigint, social_event_id uuid
)
language sql stable security definer set search_path = ''
as $$
  with mine as materialized (
    select t.id from public.threads t
    where t.user_a = (select auth.uid()) or t.user_b = (select auth.uid())
       or t.event_id in (
            select en.event_id from public.event_entries en where en.user_id = (select auth.uid()) and en.status = 'going'
            union select ev.id from public.events ev where ev.host_user_id = (select auth.uid())
            union select ev.id from public.events ev join public.society_admins a on a.society_id = ev.society_id where a.user_id = (select auth.uid()))
       or t.social_event_id in (
            select s.id from public.social_events s where s.host_id = (select auth.uid())
            union select m.event_id from public.social_event_members m where m.user_id = (select auth.uid()) and m.status = 'going')
  ), ok as materialized (
    select mine.id from mine where public.can_use_thread(mine.id)
  )
  select t.id, t.event_id,
         coalesce(e.title, se.title, coalesce(nullif(op.display_name, ''), 'Member')),
         op.id, coalesce(nullif(op.display_name, ''), 'Member'), op.avatar_url,
         lm.body, coalesce(lm.created_at, t.created_at), lm.sender_id,
         (select count(*) from public.messages m
          where m.thread_id = t.id and m.sender_id is distinct from (select auth.uid())
            and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)),
         t.social_event_id
  from public.threads t
  join ok on ok.id = t.id
  left join public.events e on e.id = t.event_id
  left join public.social_events se on se.id = t.social_event_id
  left join public.profiles op on op.id = case when t.user_a = (select auth.uid()) then t.user_b else t.user_a end
                               and t.event_id is null and t.social_event_id is null
  left join public.thread_reads r on r.thread_id = t.id and r.user_id = (select auth.uid())
  left join lateral (
    select body, created_at, sender_id from public.messages m
    where m.thread_id = t.id order by created_at desc limit 1
  ) lm on true
  where (e.id is null or e.ends_at > now() - interval '7 days')
    and (se.id is null or se.ends_at > now() - interval '7 days')
    and (e.id is null or not e.is_draft
         or (e.society_id is not null and public.is_society_committee(e.society_id))
         or e.host_user_id = (select auth.uid()))
  order by coalesce(lm.created_at, t.created_at) desc
  limit 100;
$$;

-- Who can use a chat (20261114000000_society_event_chats.sql): a draft's
-- chat exists (event_create_chat is unchanged), but only its committee (or
-- the student hosting it) can use it until it's published.
create or replace function public.can_use_thread(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.threads t
    where t.id = tid and (
      (t.event_id is null and t.social_event_id is null
        and (select auth.uid()) in (t.user_a, t.user_b)
        and (public.are_friends(t.user_a, t.user_b)
             or (t.via_social_event is not null and not public.is_blocked_between(t.user_a, t.user_b))))
      or (t.event_id is not null
        and (public.is_event_host(t.event_id)
             or (public.is_going_to(t.event_id)
                 and not exists (select 1 from public.events d where d.id = t.event_id and d.is_draft))
             or exists (select 1 from public.events e where e.id = t.event_id and e.society_id is not null and public.is_society_committee(e.society_id))))
      or (t.social_event_id is not null
        and (public.social_is_host(t.social_event_id) or public.social_is_going(t.social_event_id)))
    )
  );
$$;

-- Opening an event's chat (20261114000000_society_event_chats.sql): the
-- same people as above.
create or replace function public.open_event_chat(eid uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  tid uuid;
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  if not (public.is_event_host(eid)
          or (public.is_going_to(eid) and not exists (select 1 from public.events d where d.id = eid and d.is_draft))
          or exists (select 1 from public.events e where e.id = eid and e.society_id is not null and public.is_society_committee(e.society_id))) then
    raise exception 'Only people going can see the chat';
  end if;
  insert into public.threads (event_id) values (eid) on conflict (event_id) do nothing;
  select id into tid from public.threads where event_id = eid;
  return tid;
end;
$$;

-- Message pushes (20261114000000_society_event_chats.sql): in a draft's
-- chat, only the committee and the host hear about new messages.
create or replace function public.push_on_message()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  t record;
  who text := public.push_name(new.sender_id);
  preview text := left(coalesce(new.body, ''), 100);
  r uuid;
begin
  if new.sender_id is null then return new; end if;
  select * into t from public.threads where id = new.thread_id;
  if t is null then return new; end if;
  if t.event_id is null and t.social_event_id is null then
    perform public.queue_push(case when t.user_a = new.sender_id then t.user_b else t.user_a end, 'messages', who, preview, '/chats/' || t.id);
  elsif t.event_id is not null then
    for r in
      select distinct u from (
        select e.host_user_id as u from public.events e where e.id = t.event_id
        union select en.user_id from public.event_entries en where en.event_id = t.event_id and en.status = 'going'
          and not exists (select 1 from public.events d where d.id = t.event_id and d.is_draft)
        union select a.user_id from public.society_admins a join public.events e on e.society_id = a.society_id where e.id = t.event_id
      ) x where u is not null and u <> new.sender_id
    loop
      perform public.queue_push(r, 'messages', who || ' in ' || (select title from public.events where id = t.event_id), preview, '/chats/' || t.id);
    end loop;
  else
    for r in
      select distinct u from (
        select se.host_id as u from public.social_events se where se.id = t.social_event_id
        union select m.user_id from public.social_event_members m where m.event_id = t.social_event_id and m.status = 'going'
      ) x where u is not null and u <> new.sender_id
    loop
      perform public.queue_push(r, 'messages', who || ' in ' || (select title from public.social_events where id = t.social_event_id), preview, '/chats/' || t.id);
    end loop;
  end if;
  return new;
end;
$$;

-- The committee reshuffling a table (20261113000000_poker_seats.sql): no
-- push about a draft (someone the committee added to it isn't told about
-- it until it's published). The seat change is still recorded; the app
-- shows it as "your event" while the draft's title is hidden.
create or replace function public.randomise_table_seats(eid uuid, tid uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  players uuid[];
  olds integer[];
  moved integer := 0;
  tname text;
  ename text;
  draft boolean;
  i integer;
begin
  if not public.is_society_admin(public.event_society(eid)) then raise exception 'Only the committee can do this'; end if;
  perform 1 from public.events where id = eid for update;
  select t.name into tname from public.event_tables t where t.id = tid and t.event_id = eid;
  if tname is null then raise exception 'That table isn''t part of this event'; end if;
  select e.title, e.is_draft into ename, draft from public.events e where e.id = eid;
  -- A random order of the players at the table; position i becomes Seat i.
  select coalesce(array_agg(s.user_id order by s.rnd), '{}'), coalesce(array_agg(s.seat_no order by s.rnd), '{}')
    into players, olds
    from (select e.user_id, e.seat_no, random() as rnd from public.event_entries e where e.event_id = eid and e.table_id = tid and e.status = 'going') s;
  -- Two passes so no two players ever share a number mid-way.
  for i in 1 .. coalesce(array_length(players, 1), 0) loop
    perform set_config('function.seating', players[i]::text, true);
    update public.event_entries e set seat_no = null where e.event_id = eid and e.user_id = players[i];
  end loop;
  for i in 1 .. coalesce(array_length(players, 1), 0) loop
    perform set_config('function.seating', players[i]::text, true);
    update public.event_entries e set seat_no = i where e.event_id = eid and e.user_id = players[i];
    if i is distinct from olds[i] then
      moved := moved + 1;
      insert into public.seat_changes (event_id, user_id, table_id, seat_no, reason) values (eid, players[i], tid, i, 'randomised');
      if not draft then
        perform public.queue_push(players[i], 'seating', 'Seats reshuffled', 'You''re now in Seat ' || i || ' at ' || tname || ' for ' || ename, '/e/' || eid);
      end if;
    end if;
  end loop;
  perform set_config('function.seating', '', true);
  return moved;
end;
$$;

-- A society's published events, for Founding progress
-- (20261120000000_feature_requests_founding.sql): drafts don't count, and
-- each event is dated by when it was published (its "created_at" here), so
-- a draft published later counts from then. founding_status,
-- founding_badge_active, admin_founding_societies and queue_hub_reminders
-- use this, so they follow. Still server-only.
create or replace function public.society_published_events(sid uuid)
returns table (id uuid, created_at timestamptz, starts_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select e.id, coalesce(e.published_at, e.created_at) as created_at, e.starts_at
  from public.events e
  where e.society_id = sid
    and not e.is_cancelled
    and not e.is_hidden
    and not e.is_draft
$$;
revoke execute on function public.society_published_events(uuid) from public, anon, authenticated;

-- "<Society> posted an event" (20261109000000_push_notifications.sql): not
-- for a draft when it's created...
create or replace function public.push_on_society_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  soc text;
  r uuid;
begin
  if new.society_id is null or new.is_hidden or new.is_cancelled or new.is_draft then return new; end if;
  select name into soc from public.societies where id = new.society_id;
  for r in select m.user_id from public.society_members m where m.society_id = new.society_id and m.status = 'approved' and m.user_id is distinct from new.created_by loop
    perform public.queue_push(r, 'society_events', coalesce(soc, 'Your society') || ' posted an event', new.title, '/e/' || new.id, 'society-event:' || new.id || ':' || r);
  end loop;
  return new;
end;
$$;

-- ...but when it's published: the same push, with the same dedupe keys, so
-- nobody hears about one event twice (even if it's unpublished and
-- published again).
drop trigger if exists events_push_published on public.events;
create trigger events_push_published after update of is_draft on public.events
  for each row when (old.is_draft and not new.is_draft)
  execute function public.push_on_society_event();

-- ---------------------------------------------------------------------
-- 3. The committee's answers about each event
-- ---------------------------------------------------------------------

create table if not exists public.event_admin (
  event_id uuid primary key references public.events (id) on delete cascade,
  society_id uuid not null references public.societies (id) on delete cascade,
  expected_attendees integer check (expected_attendees between 0 and 100000),
  venue_type text not null default 'campus' check (venue_type in ('campus', 'london', 'away')),
  alcohol text not null default 'none' check (alcohol in ('none', 'available', 'focus')),
  external_speaker boolean not null default false,
  speaker_names text check (speaker_names is null or length(speaker_names) <= 500),
  speaker_org text check (speaker_org is null or length(speaker_org) <= 200),
  non_lse_guests boolean not null default false,
  open_to_public boolean not null default false,
  budget_pence integer check (budget_pence between 0 and 100000000),
  cost_lines jsonb not null default '[]'::jsonb check (jsonb_typeof(cost_lines) = 'array'),
  physical_activity boolean not null default false,
  food boolean not null default false,
  native_url text check (native_url is null or length(native_url) <= 500),
  form text check (form in ('regular', 'large', 'trip')),
  submit_by date,
  checklist jsonb not null default '{}'::jsonb check (jsonb_typeof(checklist) = 'object'),
  deadlines jsonb not null default '{}'::jsonb check (jsonb_typeof(deadlines) = 'object'),
  su_approved_at timestamptz,
  su_approved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
create index if not exists event_admin_society_idx on public.event_admin (society_id);
alter table public.event_admin enable row level security;

-- The society's managers (and Function admins) only. Nobody else sees it,
-- and there's no attendee data in it.
drop policy if exists event_admin_select on public.event_admin;
create policy event_admin_select on public.event_admin
  for select to authenticated using (public.is_society_admin(society_id));
drop policy if exists event_admin_insert on public.event_admin;
create policy event_admin_insert on public.event_admin
  for insert to authenticated with check (public.is_society_admin(society_id));
drop policy if exists event_admin_update on public.event_admin;
create policy event_admin_update on public.event_admin
  for update to authenticated
  using (public.is_society_admin(society_id)) with check (public.is_society_admin(society_id));
drop policy if exists event_admin_delete on public.event_admin;
create policy event_admin_delete on public.event_admin
  for delete to authenticated using (public.is_society_admin(society_id));

revoke all on table public.event_admin from public, anon, authenticated;
grant select, insert, update, delete on table public.event_admin to authenticated;

-- The society is always the event's (so the permission check above is
-- about the right society), and the event never changes. Who changed it
-- and when are the server's, and so is who ticked "SU approved": stamped
-- when it's ticked, kept while it stays ticked, cleared when it's unticked.
-- Changes the database makes itself further down a chain (an account being
-- deleted clears updated_by and su_approved_by) go through as they are.
create or replace function public.event_admin_stamp()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  sid uuid;
begin
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.event_id := old.event_id;
    new.created_at := old.created_at;
  else
    new.created_at := now();
  end if;
  sid := public.event_society(new.event_id);
  if sid is null then
    raise exception 'Event admin is only for society events';
  end if;
  new.society_id := sid;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  if new.su_approved_at is null then
    new.su_approved_by := null;
  elsif tg_op = 'UPDATE' and old.su_approved_at is not null then
    new.su_approved_at := old.su_approved_at;
    new.su_approved_by := old.su_approved_by;
  else
    new.su_approved_by := (select auth.uid());
  end if;
  return new;
end;
$$;
revoke execute on function public.event_admin_stamp() from public, anon, authenticated;
drop trigger if exists event_admin_stamp on public.event_admin;
create trigger event_admin_stamp before insert or update on public.event_admin
  for each row execute function public.event_admin_stamp();

-- ---------------------------------------------------------------------
-- 4. The approval gate (LSE societies with Event admin on)
-- ---------------------------------------------------------------------

-- An event of an LSE society with Event admin on can't be published (a new
-- event that isn't a draft, or a draft becoming published) until one of
-- its managers has ticked "SU approved" on its event admin. So for those
-- societies a new event is created as a draft first. Events that are
-- already published are never touched, Function admins can always publish,
-- and the database's own scripts (no logged-in user) are left alone.
create or replace function public.event_publish_gate()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.is_draft or new.society_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and not old.is_draft then
    return new;
  end if;
  if (select auth.uid()) is null or public.is_motive_admin() then
    return new;
  end if;
  if not exists (select 1 from public.societies s where s.id = new.society_id and s.university = 'LSE')
     or not public.society_feature_on(new.society_id, 'event_admin') then
    return new;
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.event_admin a where a.event_id = new.id and a.su_approved_at is not null) then
    return new;
  end if;
  raise exception 'Tick "SU approved" before publishing. LSESU must approve events before they''re promoted.';
end;
$$;
revoke execute on function public.event_publish_gate() from public, anon, authenticated;
drop trigger if exists events_su_approval_gate on public.events;
create trigger events_su_approval_gate before insert or update of is_draft on public.events
  for each row execute function public.event_publish_gate();

-- ===== 20261122000000_event_admin_documents.sql =====
-- Event admin, part 2 (Part 5b of the Society Hub): somewhere private for
-- the SU paperwork drafts, ticking off the checklist, and reminders before
-- each checklist deadline. Function prepares drafts; the committee checks
-- and submits them.
--
-- Adds:
--   - A private storage bucket 'society-documents' for the drafts Function
--     prepares (risk assessment, budget), under '<society id>/<event id>/'.
--     Only that society's managers (and Function admins) can read a file;
--     nobody using the app can add, change or delete one: files are written
--     only by the server (supabase/functions/event-documents, which uses the
--     service role). Until LSESU's templates are added to
--     docs/lsesu-templates/ nothing is written there.
--   - set_event_checklist_item(event, item, done): a manager ticks (or
--     unticks) a checklist item. The server records when and who, in
--     event_admin.checklist as { "<item>": { "done_at": ..., "done_by": ... } }.
--     That's the only way to change the checklist from the app
--     (event_admin_checklist_guard).
--     "SU approved" isn't ticked here: it's event_admin.su_approved_at
--     (20261121000000_event_admin.sql), which the approval gate reads.
--   - queue_hub_reminders(): as in 20261120000000_feature_requests_founding.sql,
--     plus a Society Hub push to each manager in the 3 days up to each
--     checklist deadline that isn't ticked yet (at most one a day per item).
--   - event_hosts(): a draft's hosts only for the people who can see it.
--
-- Only adds things (nothing is dropped, renamed or deleted) and is safe to
-- run more than once. No society on Function today has Event admin on, so
-- none of them sees a change (no event_admin rows, so no new reminders).

-- ---------------------------------------------------------------------
-- 1. The private documents bucket
-- ---------------------------------------------------------------------

-- 10 MB; Word (.docx), Excel (.xlsx) and PDF only. Private: files are
-- reached through short-lived signed links, never a public URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('society-documents', 'society-documents', false, 10485760, array[
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf'
])
on conflict (id) do nothing;

-- Reading a file: a manager of the society whose id is the file's first
-- folder, or a Function admin. The folder is compared as text (never cast
-- to a uuid), so an odd file name simply matches nobody.
drop policy if exists society_documents_select on storage.objects;
create policy society_documents_select on storage.objects for select to authenticated
  using (
    bucket_id = 'society-documents'
    and (
      exists (
        select 1 from public.society_admins a
        where a.user_id = (select auth.uid())
          and a.society_id::text = (storage.foldername(name))[1]
      )
      or public.is_motive_admin()
    )
  );
-- No insert, update or delete policies for this bucket: only the server
-- (the service role, which bypasses these rules) writes files there.

-- ---------------------------------------------------------------------
-- 2. Ticking off the checklist
-- ---------------------------------------------------------------------

-- A manager of the event's society (or a Function admin) ticks or unticks
-- one checklist item. Ticking an item that's already ticked keeps who
-- ticked it first, and when. Returns the event's checklist.
create or replace function public.set_event_checklist_item(eid uuid, item text, done boolean)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  sid uuid;
  result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Log in first';
  end if;
  if item is null or item not in ('form_submitted', 'room_confirmed', 'academic_chair', 'native_tickets', 'security_list') then
    raise exception 'That isn''t a checklist item';
  end if;
  sid := public.event_society(eid);
  if sid is null or not public.is_society_admin(sid) then
    raise exception 'Only the society''s committee can do this';
  end if;
  -- Lets this change through event_admin_checklist_guard (below), for
  -- this transaction only.
  perform set_config('function.checklist', 'on', true);
  update public.event_admin a
     set checklist = case
           when not coalesce(done, false) then a.checklist - item
           when a.checklist -> item ->> 'done_at' is not null then a.checklist
           else a.checklist || jsonb_build_object(item, jsonb_build_object('done_at', now(), 'done_by', (select auth.uid())))
         end
   where a.event_id = eid
  returning a.checklist into result;
  if not found then
    raise exception 'Add the event admin answers first';
  end if;
  -- Only after the check above: perform sets FOUND too.
  perform set_config('function.checklist', '', true);
  return result;
end;
$$;
revoke execute on function public.set_event_checklist_item(uuid, text, boolean) from public, anon;
grant execute on function public.set_event_checklist_item(uuid, text, boolean) to authenticated;

-- Ticks only go through set_event_checklist_item, so "when and who" are
-- always the server's: a manager writing event_admin directly (the
-- policies in 20261121000000_event_admin.sql allow that, for the answers)
-- can't change the checklist. A direct change keeps it as it was, and a
-- new row starts with nothing ticked. The database's own scripts (no
-- logged-in user) are left alone. A separate trigger, so event_admin_stamp
-- stays as it is.
create or replace function public.event_admin_checklist_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or current_setting('function.checklist', true) = 'on' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.checklist := old.checklist;
  else
    new.checklist := '{}'::jsonb;
  end if;
  return new;
end;
$$;
revoke execute on function public.event_admin_checklist_guard() from public, anon, authenticated;
drop trigger if exists event_admin_checklist_guard on public.event_admin;
create trigger event_admin_checklist_guard before insert or update on public.event_admin
  for each row execute function public.event_admin_checklist_guard();

-- ---------------------------------------------------------------------
-- 3. Reminders (run daily by supabase/RUN_ONCE_hub_cron.sql)
-- ---------------------------------------------------------------------

-- Copied from 20261120000000_feature_requests_founding.sql (the weekly
-- Founding nudge, unchanged), with the event admin reminders added after it.
--
-- Event admin reminders: for each upcoming event (drafts included: the
-- paperwork matters most then) that isn't cancelled or hidden, of a
-- society that still has Event admin on, each checklist item the event
-- needs (it has a deadline in event_admin.deadlines, saved from the app's
-- rules) and nobody has ticked yet: from 2 days before its deadline up to
-- the deadline itself (London dates), each of the society's managers gets
-- a Society Hub push, at most one a day per item. "SU approved" counts as
-- ticked once su_approved_at is set. A deadline that isn't a real date is
-- skipped. The push opens the event's manage screen, which every app build
-- has. Returns how many pushes were queued. Server-only.
create or replace function public.queue_hub_reminders()
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r record;
  manager uuid;
  k text;
  queued integer := 0;
  week bigint := floor(extract(epoch from now()) / 604800)::bigint;
  today date := (now() at time zone 'Europe/London')::date;
  due date;
  label text;
begin
  for r in
    select s.id, f.events_since, f.events_target
    from public.societies s
    cross join lateral public.founding_status(s.id) f
    where s.is_founding
      and f.agreed_at is not null
      and greatest(f.last_event_at, f.agreed_at) < now() - interval '7 days'
  loop
    for manager in select a.user_id from public.society_admins a where a.society_id = r.id loop
      k := 'founding-nudge:' || r.id || ':' || manager || ':' || week;
      continue when exists (select 1 from public.push_queue q where q.dedupe_key = k);
      continue when exists (select 1 from public.push_queue q
                            where q.user_id = manager
                              and q.dedupe_key like 'founding-nudge:' || r.id || ':' || manager || ':%'
                              and q.created_at > now() - interval '6 days 12 hours');
      perform public.queue_push(manager, 'hub', 'Time to post your next event?',
                                least(r.events_since, r.events_target) || ' of ' || r.events_target
                                  || ' events posted. Post your next one to keep your Founding badge.',
                                '/dashboard/' || r.id, k);
      if exists (select 1 from public.push_queue q where q.dedupe_key = k) then
        queued := queued + 1;
      end if;
    end loop;
  end loop;

  -- Event admin: the checklist items due in the next 3 days (today, and
  -- the 2 days after) that aren't ticked yet. The text comparison narrows
  -- the rows down cheaply; each date is then checked properly below.
  for r in
    select e.id as event_id, e.society_id, e.title, d.key as item, d.value as due_text
    from public.event_admin a
    join public.events e on e.id = a.event_id
    cross join lateral jsonb_each_text(a.deadlines) d
    where e.starts_at > now()
      and not e.is_cancelled
      and not e.is_hidden
      and e.society_id is not null
      and public.society_feature_on(e.society_id, 'event_admin')
      and d.key in ('form_submitted', 'su_approved', 'room_confirmed', 'academic_chair', 'native_tickets', 'security_list')
      and d.value ~ '^\d{4}-\d{2}-\d{2}$'
      and d.value collate "C" between to_char(today, 'YYYY-MM-DD') and to_char(today + 2, 'YYYY-MM-DD')
      and (a.checklist -> d.key ->> 'done_at') is null
      and not (d.key = 'su_approved' and a.su_approved_at is not null)
    order by e.starts_at, e.id, d.key
  loop
    begin
      due := r.due_text::date;
    exception when others then
      continue;
    end;
    continue when today < due - 2 or today > due;
    label := case r.item
      when 'form_submitted' then 'Form submitted on Podio'
      when 'su_approved' then 'SU approved'
      when 'room_confirmed' then 'Room confirmed'
      when 'academic_chair' then 'Academic chair secured'
      when 'native_tickets' then 'Native tickets set up'
      when 'security_list' then 'Security guest list sent'
    end;
    for manager in select a.user_id from public.society_admins a where a.society_id = r.society_id loop
      k := 'ea:' || r.event_id || ':' || r.item || ':' || manager || ':' || to_char(today, 'YYYY-MM-DD');
      continue when exists (select 1 from public.push_queue q where q.dedupe_key = k);
      perform public.queue_push(manager, 'hub',
                                label || ' due ' || to_char(due, 'Dy FMDD Mon'),
                                r.title || ': tick it off in the Society Hub once it''s done.',
                                '/dashboard/' || r.society_id || '/events/' || r.event_id, k);
      if exists (select 1 from public.push_queue q where q.dedupe_key = k) then
        queued := queued + 1;
      end if;
    end loop;
  end loop;
  return queued;
end;
$$;
revoke execute on function public.queue_hub_reminders() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. A draft's hosts
-- ---------------------------------------------------------------------

-- Who counts as the host of an event (20261114000000_society_event_chats.sql),
-- as before, but nothing at all for a draft unless you're the society's
-- committee, the student hosting it, or a Function admin (a member who
-- can't see the draft learns nothing about it).
create or replace function public.event_hosts(eid uuid)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select e.host_user_id from public.events e
  where e.id = eid and e.host_user_id is not null
    and ((select auth.uid()) is not null)
    and (not e.is_draft
         or e.host_user_id = (select auth.uid())
         or (e.society_id is not null and public.is_society_admin(e.society_id))
         or public.is_motive_admin())
    and (public.is_event_host(eid) or public.is_going_to(eid)
         or (not e.is_hidden
             and not public.is_blocked_between(e.host_user_id, (select auth.uid()))
             and (e.visibility = 'public' or public.are_friends(e.host_user_id, (select auth.uid())))))
  union
  select a.user_id from public.society_admins a
  join public.events e on e.society_id = a.society_id
  where e.id = eid
    and ((select auth.uid()) is not null)
    and (not e.is_draft
         or e.host_user_id = (select auth.uid())
         or public.is_society_admin(e.society_id)
         or public.is_motive_admin())
    and (public.is_going_to(eid) or public.is_society_admin(e.society_id) or public.is_society_member(e.society_id));
$$;
revoke execute on function public.event_hosts(uuid) from public, anon;
grant execute on function public.event_hosts(uuid) to authenticated;

-- ===== 20261123000000_hub_push_links.sql =====
-- Society Hub push links. The next App Store build includes the Society
-- Hub, so the three Society Hub notifications that opened the society's
-- dashboard (every earlier app build has that screen; none had the Hub) now
-- open the Hub instead.
--
-- Runs after 20261122000000_event_admin_documents.sql. Nothing in
-- supabase/RUN_ONCE_hub_cron.sql needs running again: the daily timer calls
-- queue_hub_reminders() by name, so it picks up the new version.
--
-- Changes:
--   - add_society_manager(): the "You're now a manager of ..." push opens
--     '/hub/<society id>' and says "Open the Society Hub to see it."
--   - push_on_request_live(): the "Your feature request is live" push opens
--     '/hub/<society id>/requests'.
--   - queue_hub_reminders(): the weekly Founding nudge opens
--     '/hub/<society id>'. The event admin checklist reminders still open
--     the event's manage screen ('/dashboard/<society id>/events/<event id>'),
--     where the Event admin card is.
-- Each function is an exact copy of its latest definition with only those
-- lines changed, and keeps its grants and revokes (re-stated below).
--
-- An older app build without the Hub screens (only TestFlight testers have
-- one) opens "not found" from these three notifications. That's acceptable:
-- updating the app fixes it.
--
-- Only replaces functions (nothing is dropped, renamed or deleted) and is
-- safe to run more than once. Societies see no other change: only where
-- these notifications open, and the wording of the "now a manager" one.

-- ---------------------------------------------------------------------
-- 1. Adding a manager
-- ---------------------------------------------------------------------

-- As in 20261119000000_society_hub.sql, but the push opens the society's
-- Hub and says "Open the Society Hub to see it."
create or replace function public.add_society_manager(sid uuid, person uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  sname text;
begin
  if sid is null or not (public.is_society_committee(sid) or public.is_motive_admin()) then
    raise exception 'Only the society''s managers can do this';
  end if;
  select s.name into sname from public.societies s where s.id = sid;
  if sname is null then
    raise exception 'Society not found';
  end if;
  -- Nobody can be made a manager by someone they've blocked, or who has
  -- blocked them. Same wording as a refused friend request.
  if public.is_blocked_between(auth.uid(), person) then
    raise exception 'You can''t add this person';
  end if;
  if person is null or not exists (select 1 from public.profiles p where p.id = person) then
    raise exception 'That person isn''t on Function';
  end if;
  insert into public.society_admins (society_id, user_id) values (sid, person)
  on conflict do nothing;
  -- Only someone newly added is told (and never the person adding themselves).
  -- The push opens the society's Hub.
  if found and person is distinct from auth.uid() then
    perform public.queue_push(person, 'hub', 'You''re now a manager of ' || sname, 'Open the Society Hub to see it.',
                              '/hub/' || sid, 'manager-added:' || sid || ':' || person);
  end if;
end;
$$;
revoke execute on function public.add_society_manager(uuid, uuid) from public, anon;
grant execute on function public.add_society_manager(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. A feature request goes live
-- ---------------------------------------------------------------------

-- As in 20261120000000_feature_requests_founding.sql, but the push opens
-- the Hub's Requests page. The trigger that calls it
-- (feature_requests_push_live) is unchanged.
create or replace function public.push_on_request_live()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  manager uuid;
begin
  for manager in select a.user_id from public.society_admins a where a.society_id = new.society_id loop
    perform public.queue_push(manager, 'hub', 'Your feature request is live', left(new.need, 100),
                              '/hub/' || new.society_id || '/requests', 'request-live:' || new.id || ':' || manager);
  end loop;
  return null;
end;
$$;
revoke execute on function public.push_on_request_live() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. The daily Hub reminders (run by supabase/RUN_ONCE_hub_cron.sql)
-- ---------------------------------------------------------------------

-- As in 20261122000000_event_admin_documents.sql, but the weekly Founding
-- nudge opens the society's Hub. The event admin checklist reminders still
-- open the event's manage screen. Server-only, as before.
create or replace function public.queue_hub_reminders()
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r record;
  manager uuid;
  k text;
  queued integer := 0;
  week bigint := floor(extract(epoch from now()) / 604800)::bigint;
  today date := (now() at time zone 'Europe/London')::date;
  due date;
  label text;
begin
  for r in
    select s.id, f.events_since, f.events_target
    from public.societies s
    cross join lateral public.founding_status(s.id) f
    where s.is_founding
      and f.agreed_at is not null
      and greatest(f.last_event_at, f.agreed_at) < now() - interval '7 days'
  loop
    for manager in select a.user_id from public.society_admins a where a.society_id = r.id loop
      k := 'founding-nudge:' || r.id || ':' || manager || ':' || week;
      continue when exists (select 1 from public.push_queue q where q.dedupe_key = k);
      continue when exists (select 1 from public.push_queue q
                            where q.user_id = manager
                              and q.dedupe_key like 'founding-nudge:' || r.id || ':' || manager || ':%'
                              and q.created_at > now() - interval '6 days 12 hours');
      perform public.queue_push(manager, 'hub', 'Time to post your next event?',
                                least(r.events_since, r.events_target) || ' of ' || r.events_target
                                  || ' events posted. Post your next one to keep your Founding badge.',
                                '/hub/' || r.id, k);
      if exists (select 1 from public.push_queue q where q.dedupe_key = k) then
        queued := queued + 1;
      end if;
    end loop;
  end loop;

  -- Event admin: the checklist items due in the next 3 days (today, and
  -- the 2 days after) that aren't ticked yet. The text comparison narrows
  -- the rows down cheaply; each date is then checked properly below.
  for r in
    select e.id as event_id, e.society_id, e.title, d.key as item, d.value as due_text
    from public.event_admin a
    join public.events e on e.id = a.event_id
    cross join lateral jsonb_each_text(a.deadlines) d
    where e.starts_at > now()
      and not e.is_cancelled
      and not e.is_hidden
      and e.society_id is not null
      and public.society_feature_on(e.society_id, 'event_admin')
      and d.key in ('form_submitted', 'su_approved', 'room_confirmed', 'academic_chair', 'native_tickets', 'security_list')
      and d.value ~ '^\d{4}-\d{2}-\d{2}$'
      and d.value collate "C" between to_char(today, 'YYYY-MM-DD') and to_char(today + 2, 'YYYY-MM-DD')
      and (a.checklist -> d.key ->> 'done_at') is null
      and not (d.key = 'su_approved' and a.su_approved_at is not null)
    order by e.starts_at, e.id, d.key
  loop
    begin
      due := r.due_text::date;
    exception when others then
      continue;
    end;
    continue when today < due - 2 or today > due;
    label := case r.item
      when 'form_submitted' then 'Form submitted on Podio'
      when 'su_approved' then 'SU approved'
      when 'room_confirmed' then 'Room confirmed'
      when 'academic_chair' then 'Academic chair secured'
      when 'native_tickets' then 'Native tickets set up'
      when 'security_list' then 'Security guest list sent'
    end;
    for manager in select a.user_id from public.society_admins a where a.society_id = r.society_id loop
      k := 'ea:' || r.event_id || ':' || r.item || ':' || manager || ':' || to_char(today, 'YYYY-MM-DD');
      continue when exists (select 1 from public.push_queue q where q.dedupe_key = k);
      perform public.queue_push(manager, 'hub',
                                label || ' due ' || to_char(due, 'Dy FMDD Mon'),
                                r.title || ': tick it off in the Society Hub once it''s done.',
                                '/dashboard/' || r.society_id || '/events/' || r.event_id, k);
      if exists (select 1 from public.push_queue q where q.dedupe_key = k) then
        queued := queued + 1;
      end if;
    end loop;
  end loop;
  return queued;
end;
$$;
revoke execute on function public.queue_hub_reminders() from public, anon, authenticated;

