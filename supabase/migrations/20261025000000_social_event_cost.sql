-- Item 6: an optional cost on Social events, display only (no payments).
-- Stored in pence: empty = not given, 0 = Free, 600 = £6. Only adds a column.
alter table public.social_events add column if not exists cost_pence integer
  check (cost_pence is null or (cost_pence >= 0 and cost_pence <= 100000));
