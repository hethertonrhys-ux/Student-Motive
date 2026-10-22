-- =====================================================================
-- Instant push notifications: tell the database where send-push is and
-- the push secret. Run ONCE in the Supabase SQL Editor, AFTER:
--   (a) the migration 20261201000000_instant_push.sql, and
--   (b) redeploying send-push:  npx supabase functions deploy send-push --no-verify-jwt
--
-- Replace <PUSH_SECRET> below with the SAME value as the PUSH_SECRET secret
-- on the send-push function (the one in RUN_ONCE_push_cron.sql). Type it
-- here in the SQL Editor only: never save it in this file, never paste it
-- in a chat. It's stored encrypted in Supabase Vault.
--
-- Safe to run again (e.g. if you change the secret): it updates them.
-- =====================================================================
do $$
declare
  fn_url constant text := 'https://xrpbmcoptyrpgkdowfdt.supabase.co/functions/v1/send-push';
  push_secret constant text := '<PUSH_SECRET>';
begin
  if push_secret = '<' || 'PUSH_SECRET>' then raise exception 'Replace <PUSH_SECRET> with your push secret first.'; end if;
  if exists (select 1 from vault.secrets where name = 'function_send_push_url') then
    perform vault.update_secret((select id from vault.secrets where name = 'function_send_push_url'), fn_url);
  else
    perform vault.create_secret(fn_url, 'function_send_push_url', 'Where the database sends instant push notifications');
  end if;
  if exists (select 1 from vault.secrets where name = 'function_push_secret') then
    perform vault.update_secret((select id from vault.secrets where name = 'function_push_secret'), push_secret);
  else
    perform vault.create_secret(push_secret, 'function_push_secret', 'The send-push function''s PUSH_SECRET');
  end if;
end $$;

-- Check (shows the names only, not the secret):
select name, created_at, updated_at from vault.secrets where name in ('function_send_push_url', 'function_push_secret');
