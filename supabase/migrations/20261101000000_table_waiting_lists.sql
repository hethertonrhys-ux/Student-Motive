-- Item 20 (approved Societies change): a waiting list for each poker table.
-- A player going to the event can queue for a full table while sitting at
-- another one. Before the event starts, when a seat opens up at that table,
-- the first person in its queue is moved across automatically (freeing
-- their old seat for others) and gets a notification. Once the event has
-- started (its start time, or any table started early), moves stop.
-- Only adds two tables, functions and triggers.

-- 1. The queues: one place per player per event.
create table if not exists public.table_waitlist (
  event_id   uuid not null,
  user_id    uuid not null,
  table_id   uuid not null references public.event_tables (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id),
  -- Leaving the event takes you off the list.
  foreign key (event_id, user_id) references public.event_entries (event_id, user_id) on delete cascade
);
create index if not exists table_waitlist_table_idx on public.table_waitlist (table_id, created_at);

-- 2. Moves made automatically, so the player can be told.
create table if not exists public.table_moves (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  from_table uuid references public.event_tables (id) on delete set null,
  to_table   uuid references public.event_tables (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists table_moves_user_idx on public.table_moves (user_id, created_at desc);

alter table public.table_waitlist enable row level security;
alter table public.table_moves enable row level security;
drop policy if exists table_waitlist_select on public.table_waitlist;
create policy table_waitlist_select on public.table_waitlist for select to authenticated
  using (user_id = (select auth.uid()) or public.is_society_admin(public.event_society(event_id)));
drop policy if exists table_moves_select on public.table_moves;
create policy table_moves_select on public.table_moves for select to authenticated
  using (user_id = (select auth.uid()) or public.is_society_admin(public.event_society(event_id)));
-- Changes only go through the functions below.

-- Has the event started? Its start time has passed, or a table started early.
create or replace function public.event_has_started(eid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.events e where e.id = eid and e.starts_at <= now())
      or exists (select 1 from public.event_tables t where t.event_id = eid and t.started_at is not null);
$$;

-- 3. Fill free seats at a table from its queue (before the start only).
create or replace function public.fill_table_from_waitlist(tid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  t record;
  next record;
begin
  select id, event_id, seats into t from public.event_tables where id = tid;
  if t.id is null or public.event_has_started(t.event_id) then return; end if;
  loop
    exit when (select count(*) from public.event_entries e where e.table_id = tid and e.status = 'going') >= t.seats;
    select w.user_id, e.table_id as old_table into next
    from public.table_waitlist w
    join public.event_entries e on e.event_id = w.event_id and e.user_id = w.user_id
    where w.table_id = tid and e.status = 'going'
    order by w.created_at
    limit 1;
    exit when next.user_id is null;
    delete from public.table_waitlist where event_id = t.event_id and user_id = next.user_id;
    insert into public.table_moves (event_id, user_id, from_table, to_table) values (t.event_id, next.user_id, next.old_table, tid);
    -- Moving them frees their old seat, which (via the trigger below) can
    -- in turn be filled from that table's queue.
    update public.event_entries set table_id = tid where event_id = t.event_id and user_id = next.user_id;
  end loop;
end;
$$;
revoke execute on function public.fill_table_from_waitlist(uuid) from public, anon, authenticated;

-- 4. Whenever a seat is freed (someone stands up, moves, leaves or is
--    removed), try to fill it. Sitting at the table you queued for takes
--    you off its queue.
create or replace function public.event_entries_waitlist()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if pg_trigger_depth() > 20 then return null; end if;
  if tg_op = 'UPDATE' and new.table_id is not null then
    delete from public.table_waitlist where event_id = new.event_id and user_id = new.user_id and table_id = new.table_id;
  end if;
  if old.table_id is not null and old.status = 'going'
     and (tg_op = 'DELETE' or new.table_id is distinct from old.table_id or new.status <> 'going') then
    perform public.fill_table_from_waitlist(old.table_id);
  end if;
  return null;
end;
$$;
drop trigger if exists event_entries_waitlist on public.event_entries;
create trigger event_entries_waitlist after update or delete on public.event_entries
  for each row execute function public.event_entries_waitlist();

-- More seats added to a table: fill them too.
create or replace function public.event_tables_waitlist()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.seats > old.seats then perform public.fill_table_from_waitlist(new.id); end if;
  return null;
end;
$$;
drop trigger if exists event_tables_waitlist on public.event_tables;
create trigger event_tables_waitlist after update of seats on public.event_tables
  for each row execute function public.event_tables_waitlist();

-- 5. What players can do.
create or replace function public.join_table_waitlist(eid uuid, tid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  my_table uuid;
  seats integer;
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform 1 from public.events where id = eid for update;
  select table_id into my_table from public.event_entries where event_id = eid and user_id = uid and status = 'going';
  if not found then raise exception 'Say you''re going first'; end if;
  select t.seats into seats from public.event_tables t where t.id = tid and t.event_id = eid;
  if seats is null then raise exception 'That table isn''t part of this event'; end if;
  if my_table is not distinct from tid then raise exception 'You''re already at that table'; end if;
  if public.event_has_started(eid) then raise exception 'The event has started, so the waiting lists are closed'; end if;
  if (select count(*) from public.event_entries e where e.table_id = tid and e.status = 'going') < seats then
    raise exception 'There''s a free seat there: just sit down';
  end if;
  insert into public.table_waitlist (event_id, user_id, table_id) values (eid, uid, tid)
  on conflict (event_id, user_id) do update set table_id = excluded.table_id, created_at = now();
end;
$$;

create or replace function public.leave_table_waitlist(eid uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.table_waitlist where event_id = eid and user_id = (select auth.uid());
$$;

-- How many are waiting at each table, and your place in the queue.
create or replace function public.table_waitlist_summary(eid uuid)
returns table (table_id uuid, waiting bigint, my_position bigint)
language sql stable security definer set search_path = ''
as $$
  select w.table_id,
         count(*),
         (select count(*) from public.table_waitlist x
          join public.table_waitlist me on me.event_id = eid and me.user_id = (select auth.uid()) and me.table_id = w.table_id
          where x.table_id = w.table_id and x.created_at <= me.created_at)
  from public.table_waitlist w
  where w.event_id = eid
  group by w.table_id;
$$;

revoke execute on function public.join_table_waitlist(uuid, uuid) from public, anon;
revoke execute on function public.leave_table_waitlist(uuid) from public, anon;
revoke execute on function public.table_waitlist_summary(uuid) from public, anon;
grant execute on function public.join_table_waitlist(uuid, uuid) to authenticated;
grant execute on function public.leave_table_waitlist(uuid) to authenticated;
grant execute on function public.table_waitlist_summary(uuid) to authenticated;
