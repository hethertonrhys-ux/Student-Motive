-- Poker cash games: numbered seats. Every player at a table has a seat
-- number (Seat 1, Seat 2, ...) so it's clear who sits where in real life.
-- Players can take a specific empty seat or any seat; the committee can
-- reshuffle a table, and each player is told their new seat. Only adds
-- things: one column, one table, one setting, a few functions and triggers.

-- ---------------------------------------------------------------------
-- 1. The seat number, unique per table
-- ---------------------------------------------------------------------

alter table public.event_entries add column if not exists seat_no integer check (seat_no between 1 and 20);
create unique index if not exists event_entries_seat_idx on public.event_entries (table_id, seat_no) where seat_no is not null;

-- The lowest empty seat at a table (ignoring one person, who may be moving).
create or replace function public.lowest_free_seat(tid uuid, skip_user uuid default null)
returns integer
language sql stable security definer set search_path = ''
as $$
  select s from generate_series(1, (select t.seats from public.event_tables t where t.id = tid)) s
  where not exists (select 1 from public.event_entries e where e.table_id = tid and e.seat_no = s and (skip_user is null or e.user_id <> skip_user))
  order by s limit 1;
$$;
revoke execute on function public.lowest_free_seat(uuid, uuid) from public, anon, authenticated;

-- Whenever someone lands on a table (joining, moving, the committee moving
-- them, the waiting list filling a seat) they get the lowest empty seat
-- unless a seat was chosen; leaving a table clears it. The reshuffle
-- below switches this off for a moment with the "function.seating" setting.
create or replace function public.event_entries_seat()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  cap integer;
begin
  if current_setting('function.seating', true) = 'manual' then return new; end if;
  if new.table_id is null or new.status <> 'going' then
    new.seat_no := null;
    return new;
  end if;
  -- Moved to another table with the old number still on the row: pick afresh.
  if tg_op = 'UPDATE' and new.table_id is distinct from old.table_id and new.seat_no is not distinct from old.seat_no then
    new.seat_no := null;
  end if;
  select t.seats into cap from public.event_tables t where t.id = new.table_id;
  if new.seat_no is not null and (cap is null or new.seat_no > cap) then new.seat_no := null; end if;
  if new.seat_no is not null and exists (select 1 from public.event_entries e where e.table_id = new.table_id and e.seat_no = new.seat_no and e.user_id <> new.user_id) then
    raise exception 'That seat has just been taken. Pick another.';
  end if;
  if new.seat_no is null then new.seat_no := public.lowest_free_seat(new.table_id, new.user_id); end if;
  return new;
end;
$$;
drop trigger if exists event_entries_seat on public.event_entries;
create trigger event_entries_seat before insert or update on public.event_entries
  for each row execute function public.event_entries_seat();

-- Fewer seats at a table (the committee edited it): anyone above the new
-- number moves down to an empty seat.
create or replace function public.event_tables_reseat()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  if new.seats < old.seats then
    for r in select e.event_id, e.user_id from public.event_entries e where e.table_id = new.id and e.seat_no > new.seats order by e.seat_no loop
      update public.event_entries set seat_no = null where event_id = r.event_id and user_id = r.user_id;
    end loop;
  end if;
  return null;
end;
$$;
drop trigger if exists event_tables_reseat on public.event_tables;
create trigger event_tables_reseat after update of seats on public.event_tables
  for each row execute function public.event_tables_reseat();

-- Players already at a table get numbers now, earliest joiner first.
do $$
declare r record;
begin
  for r in select e.event_id, e.user_id from public.event_entries e where e.table_id is not null and e.status = 'going' and e.seat_no is null order by e.created_at loop
    update public.event_entries set seat_no = null where event_id = r.event_id and user_id = r.user_id;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Taking a seat: a chosen one, or any empty one
-- ---------------------------------------------------------------------

create or replace function public.take_seat(eid uuid, tid uuid, seat integer default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cap integer;
  picked integer;
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform 1 from public.events where id = eid for update;
  select t.seats into cap from public.event_tables t where t.id = tid and t.event_id = eid;
  if cap is null then raise exception 'That table isn''t part of this event'; end if;
  if not exists (select 1 from public.event_entries where event_id = eid and user_id = uid and status = 'going') then
    perform public.join_event(eid, null);
    if not exists (select 1 from public.event_entries where event_id = eid and user_id = uid and status = 'going') then
      raise exception 'Join the event first';
    end if;
  end if;
  perform public.assert_seat_free(eid, tid);
  if seat is not null then
    if seat < 1 or seat > cap then raise exception 'That seat doesn''t exist'; end if;
    if exists (select 1 from public.event_entries e where e.table_id = tid and e.seat_no = seat and e.user_id <> uid) then
      raise exception 'That seat has just been taken. Pick another.';
    end if;
    picked := seat;
  else
    -- "Sit anywhere": a random empty seat.
    select s into picked from generate_series(1, cap) s
    where not exists (select 1 from public.event_entries e where e.table_id = tid and e.seat_no = s and e.user_id <> uid)
    order by random() limit 1;
    if picked is null then raise exception 'That table is full'; end if;
  end if;
  perform set_config('function.seating', 'manual', true);
  update public.event_entries set table_id = tid, seat_no = picked where event_id = eid and user_id = uid;
  perform set_config('function.seating', '', true);
end;
$$;
revoke execute on function public.take_seat(uuid, uuid, integer) from public, anon;
grant execute on function public.take_seat(uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Telling players about a new seat
-- ---------------------------------------------------------------------

create table if not exists public.seat_changes (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  table_id   uuid references public.event_tables (id) on delete set null,
  seat_no    integer,
  reason     text not null default 'randomised' check (reason in ('randomised', 'moved')),
  created_at timestamptz not null default now()
);
create index if not exists seat_changes_user_idx on public.seat_changes (user_id, created_at desc);
alter table public.seat_changes enable row level security;
drop policy if exists seat_changes_select on public.seat_changes;
create policy seat_changes_select on public.seat_changes for select to authenticated
  using (user_id = (select auth.uid()) or public.is_society_admin(public.event_society(event_id)));
-- Rows are only written by the functions below.

-- A new kind of push: "seating".
alter table public.notification_settings add column if not exists seating boolean not null default true;
alter table public.push_queue drop constraint if exists push_queue_kind_check;
alter table public.push_queue add constraint push_queue_kind_check check (kind in ('messages', 'friends', 'society_events', 'reminders', 'hosting', 'seating'));

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

-- ---------------------------------------------------------------------
-- 4. The committee reshuffling a table
-- ---------------------------------------------------------------------

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
  i integer;
begin
  if not public.is_society_admin(public.event_society(eid)) then raise exception 'Only the committee can do this'; end if;
  perform 1 from public.events where id = eid for update;
  select t.name into tname from public.event_tables t where t.id = tid and t.event_id = eid;
  if tname is null then raise exception 'That table isn''t part of this event'; end if;
  select e.title into ename from public.events e where e.id = eid;
  -- A random order of the players at the table; position i becomes Seat i.
  select coalesce(array_agg(s.user_id order by s.rnd), '{}'), coalesce(array_agg(s.seat_no order by s.rnd), '{}')
    into players, olds
    from (select e.user_id, e.seat_no, random() as rnd from public.event_entries e where e.event_id = eid and e.table_id = tid and e.status = 'going') s;
  perform set_config('function.seating', 'manual', true);
  -- Two passes so no two players ever share a number mid-way.
  update public.event_entries e set seat_no = null where e.event_id = eid and e.table_id = tid and e.status = 'going';
  for i in 1 .. coalesce(array_length(players, 1), 0) loop
    update public.event_entries e set seat_no = i where e.event_id = eid and e.user_id = players[i];
    if i is distinct from olds[i] then
      moved := moved + 1;
      insert into public.seat_changes (event_id, user_id, table_id, seat_no, reason) values (eid, players[i], tid, i, 'randomised');
      perform public.queue_push(players[i], 'seating', 'Seats reshuffled', 'You''re now in Seat ' || i || ' at ' || tname || ' for ' || ename, '/e/' || eid);
    end if;
  end loop;
  perform set_config('function.seating', '', true);
  return moved;
end;
$$;
revoke execute on function public.randomise_table_seats(uuid, uuid) from public, anon;
grant execute on function public.randomise_table_seats(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Poker stats for the little profile card at the table
-- ---------------------------------------------------------------------

-- Games played (tables-format events they went to that have finished) and
-- best tournament finish, if any. Counts only; nothing about money.
create or replace function public.poker_stats(person uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'games_played', (select count(*) from public.event_entries en join public.events e on e.id = en.event_id
                      where en.user_id = person and en.status = 'going' and e.format = 'tables' and e.ends_at < now() and not e.is_cancelled),
    'best_finish', (select min(en.finish_position) from public.event_entries en join public.events e on e.id = en.event_id
                      where en.user_id = person and en.finish_position is not null and not e.is_cancelled)
  );
$$;
revoke execute on function public.poker_stats(uuid) from public, anon;
grant execute on function public.poker_stats(uuid) to authenticated;
