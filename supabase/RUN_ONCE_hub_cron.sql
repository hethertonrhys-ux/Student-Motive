-- =====================================================================
-- Society Hub reminders: one daily timer. Run ONCE in the Supabase SQL
-- Editor AFTER (a) the migration 20261120000000_feature_requests_founding.sql
-- (and, later, 20261122000000_event_admin_documents.sql, which adds the event
-- admin checklist reminders to the same function), and (b) the push
-- notification setup in
-- supabase/RUN_ONCE_push_cron.sql, which this relies on: this timer only
-- queues pushes, and the "function-send-push" timer set up there sends them.
-- Needs the pg_cron extension (Database -> Extensions), already switched on
-- by the push setup.
--
-- Running it again is harmless: a timer with the same name is replaced, not
-- added twice.
-- =====================================================================
create extension if not exists pg_cron with schema pg_catalog;

-- Every day at 08:05 UTC: nudge Founding Societies that haven't posted for a
-- week (each manager at most once a week), and remind managers of event
-- admin checklist items due in the next few days (at most once a day each).
select cron.schedule('function-hub-reminders', '5 8 * * *', $$select public.queue_hub_reminders()$$);
