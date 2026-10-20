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
