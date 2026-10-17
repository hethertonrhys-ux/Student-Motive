-- =====================================================================
-- Motive: confirming your seat, and the committee starting a table early.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

-- The table a player last confirmed. If it differs from their current
-- table (they moved, or the committee moved them), they're asked to
-- confirm the change.
alter table public.event_entries
  add column confirmed_table_id uuid references public.event_tables (id) on delete set null;

create function public.confirm_seat(eid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  update public.event_entries
  set confirmed_table_id = table_id
  where event_id = eid and user_id = auth.uid() and table_id is not null;
  if not found then raise exception 'Pick a table first'; end if;
end;
$$;

-- When the committee starts a table before the event's official start.
alter table public.event_tables
  add column started_at timestamptz;
