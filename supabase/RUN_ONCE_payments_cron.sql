-- =====================================================================
-- Payments: the timer. Run ONCE in the Supabase SQL Editor AFTER
-- (a) the 20261129000000_split_payments migration, (b) deploying the
-- stripe-worker edge function with its secrets, and (c) replacing
-- <PAYMENTS_WORKER_SECRET> below with the same secret you set on it.
-- Needs the pg_cron and pg_net extensions (already on for push).
-- =====================================================================
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Every minute: send queued refunds to Stripe and pay hosts out 48 hours after their plans end.
select cron.schedule('function-payments', '* * * * *', $$
  select net.http_post(
    url := 'https://xrpbmcoptyrpgkdowfdt.supabase.co/functions/v1/stripe-worker',
    headers := '{"Content-Type": "application/json", "x-worker-secret": "<PAYMENTS_WORKER_SECRET>"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
$$);
