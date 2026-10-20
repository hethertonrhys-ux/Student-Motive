-- =====================================================================
-- Push notifications: the two timers. Run ONCE in the Supabase SQL Editor
-- AFTER (a) the push_notifications migration, (b) deploying the send-push
-- edge function, and (c) replacing <PUSH_SECRET> below with the same
-- secret you set on the function (PUSH_SECRET).
-- Needs the pg_cron and pg_net extensions (Database -> Extensions).
-- =====================================================================
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Every 5 minutes: queue "starting soon" reminders.
select cron.schedule('function-event-reminders', '*/5 * * * *', $$select public.queue_event_reminders()$$);

-- Every minute: ask the edge function to send whatever is queued.
select cron.schedule('function-send-push', '* * * * *', $$
  select net.http_post(
    url := 'https://xrpbmcoptyrpgkdowfdt.supabase.co/functions/v1/send-push',
    headers := '{"Content-Type": "application/json", "x-push-secret": "<PUSH_SECRET>"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
$$);
