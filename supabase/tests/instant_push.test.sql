-- Instant push: send-push claims its batch (never the same notification
-- twice), only the server can claim, and queuing notifications asks
-- send-push to send them once per transaction (when it's set up in Vault).
reset role;
delete from public.push_queue;

-- Without Vault/pg_net set up, queuing still works (the timer sends it).
insert into public.push_queue (user_id, kind, title, body) values ('00000000-0000-0000-0000-000000000001', 'friends', 'Hi', 'one');
select pg_temp.expect((select count(*) from public.push_queue) = 1, 'queuing works without the instant set-up');

-- Only the server (service role) can claim.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.fails('select * from public.claim_push_batch(10)'), 'a student cannot claim the queue');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails('select * from public.claim_push_batch(10)'), 'logged out cannot claim the queue');
reset role;

-- Two runs never get the same notification.
insert into public.push_queue (user_id, kind, title, body) select '00000000-0000-0000-0000-000000000002', 'friends', 'Hi', 'n' || g from generate_series(1, 4) g;
create temp table first_run as select id from public.claim_push_batch(3);
create temp table second_run as select id from public.claim_push_batch(10);
select pg_temp.expect((select count(*) from first_run) = 3, 'first run takes 3');
select pg_temp.expect((select count(*) from second_run) = 2, 'second run takes the other 2');
select pg_temp.expect(not exists (select 1 from first_run join second_run using (id)), 'no notification taken twice');
select pg_temp.expect((select count(*) from public.claim_push_batch(10)) = 0, 'nothing left to take');
-- A claim that never finished is taken again after 2 minutes; a sent one never is.
update public.push_queue set claimed_at = now() - interval '3 minutes' where id in (select id from first_run);
update public.push_queue set sent_at = now() where id = (select min(id) from first_run);
select pg_temp.expect((select count(*) from public.claim_push_batch(10)) = 2, 'stuck claims retried, sent ones not');

-- The instant nudge, with stand-ins for Vault and pg_net.
create schema if not exists vault;
create table vault.decrypted_secrets (name text, decrypted_secret text);
create schema if not exists net;
create table net.calls (url text, headers jsonb);
create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer) returns bigint language sql as $$ insert into net.calls values (url, headers) returning 1::bigint $$;

-- Not set up in Vault yet: no call.
insert into public.push_queue (user_id, kind, title, body) values ('00000000-0000-0000-0000-000000000001', 'friends', 'Hi', 'no secret');
select pg_temp.expect((select count(*) from net.calls) = 0, 'no call until Vault has the address and secret');

insert into vault.decrypted_secrets values ('function_send_push_url', 'https://example.test/functions/v1/send-push'), ('function_push_secret', 's3cret');
-- One transaction queuing three notifications: one call.
begin;
insert into public.push_queue (user_id, kind, title, body) values ('00000000-0000-0000-0000-000000000001', 'friends', 'Hi', 'a');
insert into public.push_queue (user_id, kind, title, body) values ('00000000-0000-0000-0000-000000000002', 'friends', 'Hi', 'b');
insert into public.push_queue (user_id, kind, title, body) values ('00000000-0000-0000-0000-000000000003', 'friends', 'Hi', 'c');
commit;
select pg_temp.expect((select count(*) from net.calls) = 1, 'one call per transaction');
select pg_temp.expect((select headers->>'x-push-secret' from net.calls) = 's3cret', 'the call carries the secret from Vault');
select pg_temp.expect((select url from net.calls) = 'https://example.test/functions/v1/send-push', 'to the address from Vault');
-- Through queue_push, as the app's triggers do: another call.
select public.queue_push('00000000-0000-0000-0000-000000000002', 'friends', 'Hello', 'via queue_push');
select pg_temp.expect((select count(*) from net.calls) = 2, 'queue_push triggers a call too');

-- If the call itself fails, queuing still works.
create or replace function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer) returns bigint language plpgsql as $$ begin raise exception 'network down'; end $$;
insert into public.push_queue (user_id, kind, title, body) values ('00000000-0000-0000-0000-000000000001', 'friends', 'Hi', 'still queued');
select pg_temp.expect(exists (select 1 from public.push_queue where body = 'still queued'), 'a failed call never blocks queuing');

drop schema net cascade;
drop schema vault cascade;
delete from public.push_queue;
