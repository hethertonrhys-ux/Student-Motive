-- =====================================================================
-- Instant push notifications.
--
-- Until now notifications waited in push_queue until the once-a-minute
-- timer (supabase/RUN_ONCE_push_cron.sql) asked the send-push function to
-- send them: anything from a few seconds to just over a minute.
--
-- Now, as soon as anything is added to push_queue, the database asks
-- send-push to send it (once per transaction, however many notifications
-- it added, e.g. a message to a big group chat). The request goes out
-- after the transaction commits, so the notifications are there to send.
-- The once-a-minute timer stays as the backup: if the instant call can't
-- be made, or fails, the next tick sends it.
--
-- Nobody gets the same notification twice, even when the instant call and
-- the timer run at the same moment: send-push now claims its batch with
-- claim_push_batch(), which locks the rows it takes, so two runs never
-- pick the same notification. (A claim that never finished, e.g. the
-- function crashed, is picked up again after 2 minutes.)
--
-- The function's address and the push secret are NOT in this file. They
-- live in Supabase Vault, added once with supabase/RUN_ONCE_instant_push.sql
-- (you type the secret in there, in the SQL Editor; never commit it). Until
-- they're added, this does nothing and the timer carries on as before.
--
-- Safe to run more than once.
-- =====================================================================

-- 1. Claiming a batch to send.
alter table public.push_queue add column if not exists claimed_at timestamptz;

create or replace function public.claim_push_batch(batch integer default 200)
returns table (id bigint, user_id uuid, kind text, title text, body text, url text)
language sql volatile security definer set search_path = ''
as $$
  update public.push_queue q
  set claimed_at = now()
  where q.id in (
    select p.id from public.push_queue p
    where p.sent_at is null and (p.claimed_at is null or p.claimed_at < now() - interval '2 minutes')
    order by p.created_at
    limit greatest(1, least(coalesce(batch, 200), 500))
    for update skip locked
  )
  returning q.id, q.user_id, q.kind, q.title, q.body, q.url;
$$;
revoke execute on function public.claim_push_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_push_batch(integer) to service_role;

-- 2. The instant nudge: after notifications are queued, call send-push.
create or replace function public.kick_send_push()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  fn_url text;
  secret text;
begin
  -- Once per transaction is enough: the call is made after it commits.
  if coalesce(current_setting('function.push_kicked', true), '') = 'yes' then return null; end if;
  perform set_config('function.push_kicked', 'yes', true);
  begin
    select s.decrypted_secret into fn_url from vault.decrypted_secrets s where s.name = 'function_send_push_url';
    select s.decrypted_secret into secret from vault.decrypted_secrets s where s.name = 'function_push_secret';
    if coalesce(fn_url, '') = '' or coalesce(secret, '') = '' then return null; end if;
    perform net.http_post(
      url := fn_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  exception when others then
    -- Never hold up whatever queued the notification: the timer sends it.
    null;
  end;
  return null;
end;
$$;
revoke execute on function public.kick_send_push() from public, anon, authenticated;

drop trigger if exists push_queue_kick on public.push_queue;
create trigger push_queue_kick after insert on public.push_queue
  for each statement execute function public.kick_send_push();
