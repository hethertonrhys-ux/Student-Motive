-- =====================================================================
-- Report emails: the timer. Run ONCE in the Supabase SQL Editor AFTER
-- (a) the 20261128000000_reporting_blocking migration, (b) deploying the
-- send-email edge function with its secrets, and (c) replacing
-- <EMAIL_SECRET> below with the same secret you set on the function.
-- Needs the pg_cron and pg_net extensions (already on for push).
-- =====================================================================
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Every minute: send whatever is queued (new reports to help@studentfunction.com).
select cron.schedule('function-send-email', '* * * * *', $$
  select net.http_post(
    url := 'https://xrpbmcoptyrpgkdowfdt.supabase.co/functions/v1/send-email',
    headers := '{"Content-Type": "application/json", "x-email-secret": "<EMAIL_SECRET>"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
$$);
