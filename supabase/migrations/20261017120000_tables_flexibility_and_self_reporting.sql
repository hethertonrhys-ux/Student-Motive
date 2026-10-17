-- =====================================================================
-- Motive: "also happy to play at" tables, splitting a counting
-- difference, players reporting their own result when leaving early,
-- and the committee adding late arrivals.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================


-- 1. Other tables a player would happily move to.
alter table public.event_entries
  add column also_tables uuid[] not null default '{}';

create function public.set_also_tables(eid uuid, tids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mine uuid;
begin
  if uid is null then raise exception 'Log in first'; end if;
  select table_id into mine from public.event_entries where event_id = eid and user_id = uid;
  if not found then raise exception 'Join the event first'; end if;
  update public.event_entries
  set also_tables = coalesce((
    select array_agg(t.id order by t.position)
    from public.event_tables t
    where t.event_id = eid and t.id = any (tids) and t.id is distinct from mine
  ), '{}')
  where event_id = eid and user_id = uid;
end;
$$;


-- 2. An even share of any counting difference, kept separate from what
--    the player actually reported. Also record who entered each line.
alter table public.ledger_rows
  add column adjust_pence integer not null default 0 check (abs(adjust_pence) <= 1000000),
  add column created_by uuid default auth.uid() references public.profiles (id) on delete set null;

alter table public.ledger_payments
  add column created_by uuid default auth.uid() references public.profiles (id) on delete set null;


-- 3. Players reporting their own result and payments (e.g. leaving early).
--    Only for their own row, only at their own table, only until the
--    committee shares the final results.

create function public.my_ledger_row(eid uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  entry public.event_entries;
  ev public.events;
  row_id uuid;
begin
  if uid is null then raise exception 'Log in first'; end if;
  select * into ev from public.events where id = eid;
  if not found then raise exception 'Event not found'; end if;
  if ev.results_published then raise exception 'The results are final. Ask the committee to change them.'; end if;
  select * into entry from public.event_entries where event_id = eid and user_id = uid and status = 'going';
  if not found then raise exception 'Join the event first'; end if;
  if ev.format = 'tables' and entry.table_id is null then raise exception 'Pick your table first'; end if;

  select id into row_id from public.ledger_rows where event_id = eid and user_id = uid;
  if row_id is null then
    insert into public.ledger_rows (event_id, table_id, user_id, player_name, net_pence, created_by)
    select eid, entry.table_id, uid, coalesce(nullif(p.display_name, ''), 'Member'), 0, uid
    from public.profiles p where p.id = uid
    returning id into row_id;
  end if;
  return row_id;
end;
$$;
revoke execute on function public.my_ledger_row(uuid) from public, anon, authenticated;

create function public.record_my_result(eid uuid, net_pence integer)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  row_id uuid := public.my_ledger_row(eid);
begin
  if abs(net_pence) > 10000000 then raise exception 'That amount is too large'; end if;
  update public.ledger_rows set net_pence = record_my_result.net_pence, created_by = auth.uid() where id = row_id;
end;
$$;

-- other_user: the player at your table you paid (i_paid = true) or who paid you.
create function public.record_my_payment(eid uuid, other_user uuid, amount_pence integer, i_paid boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mine uuid := public.my_ledger_row(eid);
  my_table uuid;
  other_row uuid;
begin
  if amount_pence is null or amount_pence < 1 or amount_pence > 10000000 then raise exception 'Enter an amount'; end if;
  if other_user = uid then raise exception 'Choose another player'; end if;
  select table_id into my_table from public.ledger_rows where id = mine;

  if not exists (
    select 1 from public.event_entries
    where event_id = eid and user_id = other_user and status = 'going' and table_id is not distinct from my_table
  ) then
    raise exception 'They need to be at your table';
  end if;

  select id into other_row from public.ledger_rows where event_id = eid and user_id = other_user;
  if other_row is null then
    insert into public.ledger_rows (event_id, table_id, user_id, player_name, net_pence, created_by)
    select eid, my_table, other_user, coalesce(nullif(p.display_name, ''), 'Member'), 0, uid
    from public.profiles p where p.id = other_user
    returning id into other_row;
  end if;

  insert into public.ledger_payments (event_id, from_row, to_row, amount_pence, created_by)
  values (
    eid,
    case when i_paid then mine else other_row end,
    case when i_paid then other_row else mine end,
    amount_pence,
    uid
  );
end;
$$;

create function public.delete_my_payment(pid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.ledger_payments p
  using public.events e
  where p.id = pid and p.created_by = auth.uid() and e.id = p.event_id and not e.results_published;
end;
$$;

-- Players can see their own table's ledger lines while the event is on,
-- so they can check what they've entered.
drop policy ledger_rows_select on public.ledger_rows;
create policy ledger_rows_select on public.ledger_rows for select to authenticated
  using (public.can_see_results(event_id) or user_id = (select auth.uid()) or created_by = (select auth.uid()));
drop policy ledger_payments_select on public.ledger_payments;
create policy ledger_payments_select on public.ledger_payments for select to authenticated
  using (
    public.can_see_results(event_id) or created_by = (select auth.uid())
    or exists (select 1 from public.ledger_rows r where r.id in (from_row, to_row) and r.user_id = (select auth.uid()))
  );


-- 4. The committee can add someone to an event (e.g. arriving late).
create policy event_entries_admin_insert on public.event_entries for insert to authenticated
  with check (public.is_society_admin(public.event_society(event_id)));
