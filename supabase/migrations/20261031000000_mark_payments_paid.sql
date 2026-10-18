-- Item 19 (approved Societies change): players can mark a "who pays who"
-- payment as paid once results are shared, and undo their own mark.
-- A mark is saved as a payment (the same "payments already made" the
-- committee uses), so "who pays who" recalculates from it automatically.
-- Only adds two functions.

create or replace function public.mark_payment_paid(eid uuid, from_row uuid, to_row uuid, amount_pence integer)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  committee boolean := public.is_society_admin(public.event_society(eid));
  pid uuid;
begin
  if uid is null then raise exception 'Log in first'; end if;
  if amount_pence is null or amount_pence < 1 or amount_pence > 10000000 then raise exception 'Enter an amount'; end if;
  if (select count(*) from public.ledger_rows r where r.event_id = eid and r.id in (from_row, to_row)) <> 2 then
    raise exception 'Those players aren''t in this game';
  end if;
  if not committee then
    if not exists (select 1 from public.events e where e.id = eid and e.results_published) then
      raise exception 'The results haven''t been shared yet';
    end if;
    if not exists (select 1 from public.ledger_rows r where r.id in (from_row, to_row) and r.user_id = uid) then
      raise exception 'Only the two players in a payment can mark it paid';
    end if;
  end if;
  insert into public.ledger_payments (event_id, from_row, to_row, amount_pence, created_by)
  values (eid, from_row, to_row, amount_pence, uid)
  returning id into pid;
  return pid;
end;
$$;

-- Undo a mark you made (the committee can undo any).
create or replace function public.undo_payment_mark(pid uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.ledger_payments p
  where p.id = pid
    and (p.created_by = (select auth.uid()) or public.is_society_admin(public.event_society(p.event_id)));
$$;

revoke execute on function public.mark_payment_paid(uuid, uuid, uuid, integer) from public, anon;
revoke execute on function public.undo_payment_mark(uuid) from public, anon;
grant execute on function public.mark_payment_paid(uuid, uuid, uuid, integer) to authenticated;
grant execute on function public.undo_payment_mark(uuid) to authenticated;
