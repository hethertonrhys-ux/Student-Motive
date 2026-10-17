-- =====================================================================
-- Motive: society members, event formats (sign-up lists and tables),
-- and the results ledger.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Society members (approved by the society's committee)
-- ---------------------------------------------------------------------

create type public.membership_status as enum ('pending', 'approved');

create table public.society_members (
  society_id  uuid not null references public.societies (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  status      public.membership_status not null default 'pending',
  created_at  timestamptz not null default now(),
  approved_at timestamptz,
  primary key (society_id, user_id)
);
create index society_members_user_idx on public.society_members (user_id);

-- Emails the committee has pre-approved (e.g. pasted from the SU membership
-- list). When someone with one of these emails asks to join, they're
-- approved straight away.
create table public.society_member_invites (
  society_id uuid not null references public.societies (id) on delete cascade,
  email      text not null check (email = lower(email)),
  created_at timestamptz not null default now(),
  primary key (society_id, email)
);

-- Is the logged-in user an approved member (or an admin) of this society?
create function public.is_society_member(sid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.society_members
    where society_id = sid and user_id = (select auth.uid()) and status = 'approved'
  ) or public.is_society_admin(sid);
$$;

-- A student asks to join. Also saves the name they want shown to others.
create function public.request_membership(sid uuid, your_name text)
returns public.membership_status
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  user_email text;
  result public.membership_status;
begin
  if uid is null then raise exception 'Log in first'; end if;
  if not exists (select 1 from public.societies where id = sid) then raise exception 'Society not found'; end if;

  if nullif(trim(your_name), '') is not null then
    update public.profiles set display_name = left(trim(your_name), 60) where id = uid;
  end if;

  select email into user_email from public.profiles where id = uid;

  insert into public.society_members (society_id, user_id, status, approved_at)
  select sid, uid,
         case when inv.email is not null then 'approved'::public.membership_status else 'pending' end,
         case when inv.email is not null then now() end
  from (select 1) one
  left join public.society_member_invites inv on inv.society_id = sid and inv.email = user_email
  on conflict (society_id, user_id) do nothing;

  select status into result from public.society_members where society_id = sid and user_id = uid;
  return result;
end;
$$;

-- The committee pastes in member emails. Existing users are approved now;
-- everyone else is approved automatically when they sign up and ask to join.
create function public.invite_members(sid uuid, emails text[])
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  e text;
  added integer := 0;
  uid uuid;
begin
  if not public.is_society_admin(sid) then raise exception 'Not allowed'; end if;
  foreach e in array emails loop
    e := lower(trim(e));
    continue when e !~ '^[^@\s]+@[^@\s]+$';
    insert into public.society_member_invites (society_id, email) values (sid, e) on conflict do nothing;
    select id into uid from public.profiles where email = e;
    if uid is not null then
      insert into public.society_members (society_id, user_id, status, approved_at)
      values (sid, uid, 'approved', now())
      on conflict (society_id, user_id) do update set status = 'approved', approved_at = coalesce(public.society_members.approved_at, now());
    end if;
    added := added + 1;
  end loop;
  return added;
end;
$$;

-- Members list for the committee, including emails (only admins can call it).
create function public.society_member_list(sid uuid)
returns table (user_id uuid, name text, email text, status text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.user_id, coalesce(nullif(p.display_name, ''), split_part(p.email, '@', 1)), p.email, m.status::text, m.created_at
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

alter table public.society_members enable row level security;
alter table public.society_member_invites enable row level security;

-- Students see their own memberships and can leave. Joining goes through request_membership().
create policy society_members_select on public.society_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_society_admin(society_id));
create policy society_members_leave on public.society_members for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_society_admin(society_id));
create policy society_members_admin_update on public.society_members for update to authenticated
  using (public.is_society_admin(society_id)) with check (public.is_society_admin(society_id));

create policy society_member_invites_admin on public.society_member_invites for all to authenticated
  using (public.is_society_admin(society_id)) with check (public.is_society_admin(society_id));

-- Names and photos people can see of each other (never emails).
create view public.profile_cards with (security_invoker = false) as
  select id, coalesce(nullif(display_name, ''), 'Member') as name, avatar_url
  from public.profiles;
revoke all on public.profile_cards from anon;
grant select on public.profile_cards to authenticated;


-- ---------------------------------------------------------------------
-- 2. Event formats
--   standard: people tap "I'm going"
--   entries:  a sign-up list, with an optional limit and a waiting list (e.g. tournaments)
--   tables:   people pick a table, each with a level and a number of seats (e.g. cash games)
-- ---------------------------------------------------------------------

alter table public.events
  add column format text not null default 'standard' check (format in ('standard', 'entries', 'tables')),
  add column capacity integer check (capacity is null or capacity between 1 and 2000),
  add column members_only boolean not null default false,
  add column results_published boolean not null default false;

create table public.event_tables (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  level      text check (char_length(level) <= 40),     -- e.g. "10p/20p"
  seats      integer not null default 8 check (seats between 2 and 20),
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index event_tables_event_idx on public.event_tables (event_id);

create type public.entry_status as enum ('going', 'waitlist');

-- Who's coming to an event. Replaces the old "going" table.
create table public.event_entries (
  event_id        uuid not null references public.events (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  status          public.entry_status not null default 'going',
  table_id        uuid references public.event_tables (id) on delete set null,
  finish_position integer check (finish_position > 0),   -- tournaments
  created_at      timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_entries_user_idx on public.event_entries (user_id);
create index event_entries_table_idx on public.event_entries (table_id);

insert into public.event_entries (event_id, user_id, status, created_at)
select event_id, user_id, 'going', created_at from public.going;
drop table public.going;
drop function public.update_going_count();

-- Keep events.going_count in step.
create function public.refresh_going_count()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  eid uuid := coalesce(new.event_id, old.event_id);
begin
  update public.events
  set going_count = (select count(*) from public.event_entries where event_id = eid and status = 'going')
  where id = eid;
  return null;
end;
$$;

create trigger event_entries_going_count
  after insert or update or delete on public.event_entries
  for each row execute function public.refresh_going_count();

create function public.event_society(eid uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select society_id from public.events where id = eid $$;

-- Join an event (optionally straight onto a table).
-- Locks the event row so two people can't take the last seat at once.
create function public.join_event(eid uuid, tid uuid default null)
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
  if ev.ends_at < now() then raise exception 'This event has finished'; end if;
  if ev.members_only and not public.is_society_member(ev.society_id) then
    raise exception 'Only members of this society can join';
  end if;

  select status into result from public.event_entries where event_id = eid and user_id = uid;
  if found then
    if tid is not null then perform public.choose_table(eid, tid); end if;
    return result;
  end if;

  result := 'going';
  if ev.format = 'entries' and ev.capacity is not null
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

create function public.assert_seat_free(eid uuid, tid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  t public.event_tables;
begin
  select * into t from public.event_tables where id = tid and event_id = eid;
  if not found then raise exception 'That table isn''t part of this event'; end if;
  if (select count(*) from public.event_entries where table_id = tid and status = 'going' and user_id <> auth.uid()) >= t.seats then
    raise exception 'That table is full';
  end if;
end;
$$;
revoke execute on function public.assert_seat_free(uuid, uuid) from public, anon, authenticated;

-- Pick, change or leave a table (tid = null stands up from your table).
create function public.choose_table(eid uuid, tid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform 1 from public.events where id = eid for update;
  if not exists (select 1 from public.event_entries where event_id = eid and user_id = uid and status = 'going') then
    raise exception 'Join the event first';
  end if;
  if tid is not null then perform public.assert_seat_free(eid, tid); end if;
  update public.event_entries set table_id = tid where event_id = eid and user_id = uid;
end;
$$;

-- Leave an event. If there's a waiting list, the next person moves up.
create function public.leave_event(eid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  was public.entry_status;
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform 1 from public.events where id = eid for update;
  delete from public.event_entries where event_id = eid and user_id = uid returning status into was;
  if was = 'going' then perform public.promote_waitlist(eid); end if;
end;
$$;

create function public.promote_waitlist(eid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.events;
begin
  select * into ev from public.events where id = eid;
  if ev.format <> 'entries' then return; end if;
  if ev.capacity is not null
     and (select count(*) from public.event_entries where event_id = eid and status = 'going') >= ev.capacity then
    return;
  end if;
  update public.event_entries set status = 'going'
  where (event_id, user_id) = (
    select event_id, user_id from public.event_entries
    where event_id = eid and status = 'waitlist' order by created_at limit 1
  );
end;
$$;
revoke execute on function public.promote_waitlist(uuid) from public, anon, authenticated;

alter table public.event_tables enable row level security;
alter table public.event_entries enable row level security;

-- Tables are as public as the event.
create policy event_tables_select on public.event_tables for select to anon, authenticated
  using (exists (select 1 from public.events e where e.id = event_id));
create policy event_tables_admin on public.event_tables for all to authenticated
  using (public.is_society_admin(public.event_society(event_id)))
  with check (public.is_society_admin(public.event_society(event_id)));

-- Entries: you see your own; the society's members and committee see who's coming.
-- Joining and leaving go through join_event / choose_table / leave_event.
create policy event_entries_select on public.event_entries for select to authenticated
  using (user_id = (select auth.uid()) or public.is_society_member(public.event_society(event_id)));
create policy event_entries_admin_update on public.event_entries for update to authenticated
  using (public.is_society_admin(public.event_society(event_id)))
  with check (public.is_society_admin(public.event_society(event_id)));
create policy event_entries_admin_delete on public.event_entries for delete to authenticated
  using (public.is_society_admin(public.event_society(event_id)));


-- ---------------------------------------------------------------------
-- 3. Results ledger (who's up or down, and payments already made)
-- Amounts are in pence. The website works out "who pays who".
-- ---------------------------------------------------------------------

create table public.ledger_rows (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  table_id    uuid references public.event_tables (id) on delete cascade,
  user_id     uuid references public.profiles (id) on delete set null,   -- null for players without Motive
  player_name text not null check (char_length(player_name) between 1 and 60),
  net_pence   integer not null default 0 check (abs(net_pence) <= 10000000),
  created_at  timestamptz not null default now()
);
create index ledger_rows_event_idx on public.ledger_rows (event_id);

-- e.g. someone leaving early pays another player before the end.
create table public.ledger_payments (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  from_row     uuid not null references public.ledger_rows (id) on delete cascade,
  to_row       uuid not null references public.ledger_rows (id) on delete cascade,
  amount_pence integer not null check (amount_pence between 1 and 10000000),
  created_at   timestamptz not null default now(),
  check (from_row <> to_row)
);
create index ledger_payments_event_idx on public.ledger_payments (event_id);

-- Both players in a payment must be in the same event and at the same table.
create function public.check_ledger_payment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(distinct (event_id, coalesce(table_id::text, '')))
      from public.ledger_rows where id in (new.from_row, new.to_row)) <> 1
     or (select event_id from public.ledger_rows where id = new.from_row) <> new.event_id then
    raise exception 'Both players must be at the same table in this event';
  end if;
  return new;
end;
$$;

create trigger ledger_payments_check
  before insert or update on public.ledger_payments
  for each row execute function public.check_ledger_payment();

alter table public.ledger_rows enable row level security;
alter table public.ledger_payments enable row level security;

-- The committee manages the ledger. Once they publish results, people who
-- came to the event can see it.
create function public.can_see_results(eid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_society_admin(public.event_society(eid)) or exists (
    select 1 from public.events e
    join public.event_entries en on en.event_id = e.id and en.user_id = (select auth.uid())
    where e.id = eid and e.results_published
  );
$$;

create policy ledger_rows_select on public.ledger_rows for select to authenticated using (public.can_see_results(event_id));
create policy ledger_rows_admin on public.ledger_rows for all to authenticated
  using (public.is_society_admin(public.event_society(event_id)))
  with check (public.is_society_admin(public.event_society(event_id)));
create policy ledger_payments_select on public.ledger_payments for select to authenticated using (public.can_see_results(event_id));
create policy ledger_payments_admin on public.ledger_payments for all to authenticated
  using (public.is_society_admin(public.event_society(event_id)))
  with check (public.is_society_admin(public.event_society(event_id)));

-- Live updates for seats filling up.
alter publication supabase_realtime add table public.event_entries;
