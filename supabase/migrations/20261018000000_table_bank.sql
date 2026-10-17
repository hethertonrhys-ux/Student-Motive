-- =====================================================================
-- Motive: a "bank" player per table.
-- The bank takes everyone's buy-ins during the game and pays each player
-- their cash-out when they leave. The bank can keep the table's ledger
-- on their own phone.
--
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- =====================================================================

alter table public.event_tables
  add column bank_user_id uuid references public.profiles (id) on delete set null;

alter table public.ledger_rows
  add column buyin_pence integer not null default 0 check (buyin_pence between 0 and 10000000),
  add column cashout_pence integer check (cashout_pence between 0 and 10000000),   -- null = still playing
  add column paid_out boolean not null default false;

-- Is the logged-in user the bank for this table?
create function public.is_table_bank(tid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.event_tables where id = tid and bank_user_id = (select auth.uid()));
$$;

-- The bank can read and keep their own table's ledger.
create policy ledger_rows_bank on public.ledger_rows for all to authenticated
  using (table_id is not null and public.is_table_bank(table_id))
  with check (table_id is not null and public.is_table_bank(table_id));
