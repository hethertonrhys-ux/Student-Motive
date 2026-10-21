-- 20261129000000_split_payments.sql: paid Social plans.
--
--   Sam hosts paid plans; Bea and Cas join and pay. "The server" is the
--   Stripe functions (service_role).
--
-- Everything runs in one transaction that is rolled back at the end.
begin;

create or replace function pg_temp.as_server() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', false);
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('role', 'service_role', false);
end $$;
create or replace function pg_temp.error_of(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return null;
exception when others then
  return sqlerrm;
end $$;
create temp table ids (name text primary key, id uuid);
grant all on ids to public;
create or replace function pg_temp.id(n text) returns uuid language sql as $$ select id from ids where name = n $$;

-- ---------------------------------------------------------------------
-- 0. Running the migration again works; who can call what
-- ---------------------------------------------------------------------
reset role;
\ir ../migrations/20261129000000_split_payments.sql
select pg_temp.expect(not has_function_privilege('authenticated', 'public.payment_start(uuid, uuid, integer, integer, integer)', 'execute'), 'the app can''t start payments itself');
select pg_temp.expect(not has_function_privilege('authenticated', 'public.payment_mark_paid(uuid, text)', 'execute'), 'the app can''t mark a payment as paid');
select pg_temp.expect(not has_function_privilege('authenticated', 'public.payment_mark_refunded(uuid, text, text)', 'execute'), 'nor as refunded');
select pg_temp.expect(not has_function_privilege('authenticated', 'public.payout_account_save(uuid, text, boolean, boolean, boolean, boolean)', 'execute'), 'nor change payout accounts');
select pg_temp.expect(has_function_privilege('service_role', 'public.payment_mark_paid(uuid, text)', 'execute'), 'the server can');
select pg_temp.expect(not has_table_privilege('authenticated', 'public.plan_payments', 'insert') and not has_table_privilege('authenticated', 'public.plan_payments', 'update'), 'nobody using the app writes payments');
select pg_temp.expect(not has_table_privilege('authenticated', 'public.payout_accounts', 'insert') and not has_table_privilege('authenticated', 'public.payout_accounts', 'update'), 'nor payout accounts');
select pg_temp.expect(not has_table_privilege('authenticated', 'public.stripe_events', 'select'), 'nor reads webhook events');

-- Set-up: names, and phones that can get notifications.
update public.profiles set display_name = 'Sam' where id = '00000000-0000-0000-0000-000000000001';
update public.profiles set display_name = 'Bea' where id = '00000000-0000-0000-0000-000000000002';
update public.profiles set display_name = 'Cas' where id = '00000000-0000-0000-0000-000000000003';
insert into public.push_tokens (user_id, token, platform) values
  ('00000000-0000-0000-0000-000000000001', 'ExponentPushToken[sam]', 'ios'),
  ('00000000-0000-0000-0000-000000000002', 'ExponentPushToken[bea]', 'ios'),
  ('00000000-0000-0000-0000-000000000003', 'ExponentPushToken[cas]', 'ios');

-- ---------------------------------------------------------------------
-- 1. Creating a paid plan needs payouts set up; the price is worked out here
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.error_of($$insert into public.social_events (title, category, starts_at, ends_at, area, lat, lng, spaces, collect_payments, total_cost_pence)
  values ('Powerleague', 'sport', now() + interval '2 days', now() + interval '2 days 2 hours', 'Powerleague Shoreditch', 51.5, -0.08, 10, true, 8000)$$) like '%Set up payouts first%',
  'Sam can''t create a paid plan before setting up payouts');
select pg_temp.as_server();
select public.payout_account_save('00000000-0000-0000-0000-000000000001', 'acct_sam', true, true, true, false);
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select ready from public.payout_accounts) and (select count(*) from public.payout_accounts) = 1, 'Sam sees his own payout account, ready');
select pg_temp.expect(pg_temp.error_of($$insert into public.social_events (title, category, starts_at, ends_at, area, lat, lng, spaces, collect_payments)
  values ('No total', 'sport', now() + interval '2 days', now() + interval '2 days 2 hours', 'Somewhere', 51.5, -0.08, 10, true)$$) like '%total cost%', 'a paid plan needs a total');
insert into public.social_events (title, category, starts_at, ends_at, area, lat, lng, spaces, collect_payments, total_cost_pence, cost_pence)
values ('Powerleague', 'sport', now() + interval '2 days', now() + interval '2 days 2 hours', 'Powerleague Shoreditch', 51.5, -0.08, 10, true, 8000, 1);
insert into ids select 'plan', id from public.social_events where title = 'Powerleague';
select pg_temp.expect((select cost_pence from public.social_events where id = pg_temp.id('plan')) = 800, '£80 ÷ 10 spaces = £8 each (whatever the app sent)');
insert into public.social_events (title, category, starts_at, ends_at, area, lat, lng, spaces, collect_payments, total_cost_pence)
values ('Thirds', 'sport', now() + interval '2 days', now() + interval '2 days 2 hours', 'Somewhere', 51.5, -0.08, 3, true, 8000);
select pg_temp.expect((select cost_pence from public.social_events where title = 'Thirds') = 2667, '£80 ÷ 3 rounds up to £26.67');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(not exists (select 1 from public.payout_accounts), 'Bea can''t see Sam''s payout account');

-- ---------------------------------------------------------------------
-- 2. Paying: only people going, once
-- ---------------------------------------------------------------------
select public.social_join(pg_temp.id('plan'));
select pg_temp.as_server();
select pg_temp.expect(pg_temp.error_of($$select public.payment_start(pg_temp.id('plan'), '00000000-0000-0000-0000-000000000003', 833, 33, 33)$$) like '%Join the plan first%', 'Cas (not going) can''t pay');
select pg_temp.expect(pg_temp.error_of($$select public.payment_start(pg_temp.id('plan'), '00000000-0000-0000-0000-000000000001', 833, 33, 33)$$) like '%host%', 'the host doesn''t pay');
insert into ids select 'bea1', payment_id from public.payment_start(pg_temp.id('plan'), '00000000-0000-0000-0000-000000000002', 833, 33, 33);
select pg_temp.expect((select payment_id from public.payment_start(pg_temp.id('plan'), '00000000-0000-0000-0000-000000000002', 833, 33, 33)) = pg_temp.id('bea1'), 'tapping Pay again carries on the same payment');
select pg_temp.expect((select share_pence = 800 and host_account_id = 'acct_sam' and status = 'pending' from public.plan_payments where id = pg_temp.id('bea1')), 'the payment records the £8 share and Sam''s account');
select public.payment_attach(pg_temp.id('bea1'), 'pi_bea1', null);

select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.fails($$update public.plan_payments set status = 'paid'$$) and (select status from public.plan_payments where id = pg_temp.id('bea1')) = 'pending', 'Bea can''t mark herself as paid');
select pg_temp.expect((select status from public.plan_payment_statuses(pg_temp.id('plan')) where user_id = '00000000-0000-0000-0000-000000000002') = 'unpaid', 'until Stripe confirms, she shows as Not paid yet');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(not exists (select 1 from public.plan_payment_statuses(pg_temp.id('plan'))), 'Cas (not going) doesn''t see who has paid');
select pg_temp.expect(not exists (select 1 from public.plan_payments), 'nor anyone''s payments');

-- A failed card, then success (by the webhook).
select pg_temp.as_server();
select public.payment_mark_failed(null, 'pi_bea1', 'Your card was declined.');
select pg_temp.expect((select status from public.plan_payments where id = pg_temp.id('bea1')) = 'failed', 'a declined card is recorded as failed');
select pg_temp.expect(public.payment_mark_paid(pg_temp.id('bea1'), 'pi_bea1') = 'paid', 'Stripe confirms the payment');
select pg_temp.expect(public.payment_mark_paid(pg_temp.id('bea1'), 'pi_bea1') = 'paid' and (select count(*) from public.push_queue where body like 'Bea paid £8.00 for Powerleague') = 1, 'Sam is told once, even if Stripe says it twice');
select pg_temp.expect(pg_temp.error_of($$select public.payment_start(pg_temp.id('plan'), '00000000-0000-0000-0000-000000000002', 833, 33, 33)$$) like '%already paid%', 'Bea can''t pay twice');
select pg_temp.expect(public.stripe_event_first('evt_1', 'payment_intent.succeeded') and not public.stripe_event_first('evt_1', 'payment_intent.succeeded'), 'each webhook event is handled once');

select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select status from public.plan_payment_statuses(pg_temp.id('plan')) where user_id = '00000000-0000-0000-0000-000000000002') = 'paid', 'Sam sees Bea as Paid');
select pg_temp.expect((select count(*) from public.plan_payments) = 1, 'Sam can see payments for his plan');
select pg_temp.expect(pg_temp.error_of($$update public.social_events set total_cost_pence = 9000 where id = pg_temp.id('plan')$$) like '%already paid%', 'the price can''t change once someone has paid');
select pg_temp.expect(pg_temp.error_of($$update public.social_events set spaces = 12 where id = pg_temp.id('plan')$$) like '%already paid%', 'nor the spaces (which would change the price)');
select pg_temp.expect(pg_temp.error_of($$update public.social_events set collect_payments = false where id = pg_temp.id('plan')$$) like '%already paid%', 'nor can payments be turned off');
update public.social_events set title = 'Powerleague 5-a-side' where id = pg_temp.id('plan');
select pg_temp.expect((select title from public.social_events where id = pg_temp.id('plan')) = 'Powerleague 5-a-side', 'other details can still change');

-- ---------------------------------------------------------------------
-- 3. Refunds: the payer asks, only the host decides
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.error_of($$select public.social_leave(pg_temp.id('plan'))$$) like '%refund%', 'Bea can''t just leave after paying');
select public.plan_request_refund(pg_temp.id('plan'), 'Twisted my ankle');
select pg_temp.expect((select status = 'refund_requested' and refund_reason = 'Twisted my ankle' from public.plan_payments), 'Bea asks for a refund, with a reason');
select pg_temp.as_server();
select pg_temp.expect(exists (select 1 from public.push_queue where user_id = '00000000-0000-0000-0000-000000000001' and title = 'Refund request'), 'Sam is told');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.error_of($$select public.plan_decide_refund(pg_temp.id('bea1'), true)$$) like '%Only the host%', 'Bea can''t approve her own refund');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(pg_temp.error_of($$select public.plan_decide_refund(pg_temp.id('bea1'), true)$$) like '%Only the host%', 'nor can Cas');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select public.plan_decide_refund(pg_temp.id('bea1'), false);
select pg_temp.expect((select status from public.plan_payments where id = pg_temp.id('bea1')) = 'refund_declined', 'Sam declines');
select pg_temp.as_server();
select pg_temp.expect(exists (select 1 from public.push_queue where user_id = '00000000-0000-0000-0000-000000000002' and title = 'Refund declined'), 'Bea is told');
select pg_temp.expect(not exists (select 1 from public.payment_refunds_due()), 'nothing is refunded');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect((select status from public.plan_payment_statuses(pg_temp.id('plan')) where user_id = '00000000-0000-0000-0000-000000000002') = 'paid', 'she still shows as Paid and keeps her place');
select public.plan_request_refund(pg_temp.id('plan'), null);
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select public.plan_decide_refund(pg_temp.id('bea1'), true);
select pg_temp.as_server();
select pg_temp.expect((select payment_intent_id from public.payment_refunds_due()) = 'pi_bea1', 'after Sam approves, the refund is waiting to go to Stripe');
select public.payment_refund_started(pg_temp.id('bea1'), 're_bea1');
select pg_temp.expect((select status from public.plan_payments where id = pg_temp.id('bea1')) = 'refund_pending', 'sent to Stripe');
select public.payment_mark_refunded(null, 'pi_bea1', 're_bea1');
select pg_temp.expect((select status from public.plan_payments where id = pg_temp.id('bea1')) = 'refunded', 'Stripe confirms the refund');
select pg_temp.expect(not exists (select 1 from public.social_event_members where event_id = pg_temp.id('plan') and user_id = '00000000-0000-0000-0000-000000000002'), 'Bea leaves the plan');
select pg_temp.expect(exists (select 1 from public.push_queue where user_id = '00000000-0000-0000-0000-000000000002' and title = 'Refund on its way'), 'and is told her refund is on its way');

-- ---------------------------------------------------------------------
-- 4. Removed after paying: refunded automatically
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select public.social_join(pg_temp.id('plan'));
select pg_temp.as_server();
insert into ids select 'bea2', payment_id from public.payment_start(pg_temp.id('plan'), '00000000-0000-0000-0000-000000000002', 833, 33, 33);
select pg_temp.expect(pg_temp.id('bea2') <> pg_temp.id('bea1'), 'joining again means a new payment');
select public.payment_attach(pg_temp.id('bea2'), 'pi_bea2', null);
select public.payment_mark_paid(pg_temp.id('bea2'), 'pi_bea2');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select public.social_remove_guest(pg_temp.id('plan'), '00000000-0000-0000-0000-000000000002');
select pg_temp.as_server();
select pg_temp.expect((select status = 'refund_queued' and refund_cause = 'removed' from public.plan_payments where id = pg_temp.id('bea2')), 'Sam removing Bea refunds her');

-- Left before paying: the unfinished payment is dropped, and if Stripe
-- confirms it anyway, it's refunded.
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select public.social_join(pg_temp.id('plan'));
select pg_temp.as_server();
insert into ids select 'cas1', payment_id from public.payment_start(pg_temp.id('plan'), '00000000-0000-0000-0000-000000000003', 833, 33, 33);
select public.payment_attach(pg_temp.id('cas1'), 'pi_cas1', null);
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select public.social_leave(pg_temp.id('plan'));
select pg_temp.as_server();
select pg_temp.expect((select status from public.plan_payments where id = pg_temp.id('cas1')) = 'cancelled', 'Cas leaves before paying: the payment is dropped');
select pg_temp.expect(public.payment_mark_paid(pg_temp.id('cas1'), 'pi_cas1') = 'refund_queued', 'a payment that goes through after leaving is refunded');

-- ---------------------------------------------------------------------
-- 5. The host cancels: everyone who paid is refunded
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select public.social_join(pg_temp.id('plan'));
select pg_temp.as_server();
insert into ids select 'cas2', payment_id from public.payment_start(pg_temp.id('plan'), '00000000-0000-0000-0000-000000000003', 833, 33, 33);
select public.payment_attach(pg_temp.id('cas2'), 'pi_cas2', null);
select public.payment_mark_paid(pg_temp.id('cas2'), 'pi_cas2');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
update public.social_events set is_cancelled = true where id = pg_temp.id('plan');
select pg_temp.as_server();
select pg_temp.expect((select status = 'refund_queued' and refund_cause = 'cancelled' from public.plan_payments where id = pg_temp.id('cas2')), 'cancelling refunds Cas');
select pg_temp.expect(pg_temp.error_of($$select public.payment_start(pg_temp.id('plan'), '00000000-0000-0000-0000-000000000003', 833, 33, 33)$$) like '%cancelled%', 'nobody can pay for a cancelled plan');
select public.payment_refund_failed(pg_temp.id('cas2'), null, 'insufficient_funds');
select pg_temp.expect((select status from public.plan_payments where id = pg_temp.id('cas2')) = 'refund_failed'
  and exists (select 1 from public.email_queue where subject = '[Function payments] A refund failed'), 'a failed refund is kept and the team is emailed');

-- ---------------------------------------------------------------------
-- 6. Deleting a paid plan refunds too (the payment rows stay)
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select public.social_join((select id from public.social_events where title = 'Thirds'));
select pg_temp.as_server();
insert into ids select 'bea3', payment_id from public.payment_start((select id from public.social_events where title = 'Thirds'), '00000000-0000-0000-0000-000000000002', 2700, 33, 33);
select public.payment_mark_paid(pg_temp.id('bea3'), 'pi_bea3');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
delete from public.social_events where title = 'Thirds';
select pg_temp.as_server();
select pg_temp.expect((select status = 'refund_queued' and refund_cause = 'deleted' and event_id is null from public.plan_payments where id = pg_temp.id('bea3')), 'deleting the plan refunds Bea');

-- ---------------------------------------------------------------------
-- 7. Payouts: 48 hours after the plan ends
-- ---------------------------------------------------------------------
reset role;
insert into public.social_events (host_id, title, category, starts_at, ends_at, area, lat, lng, spaces, collect_payments, total_cost_pence)
values ('00000000-0000-0000-0000-000000000001', 'Last week', 'sport', now() - interval '4 days', now() - interval '3 days', 'Somewhere', 51.5, -0.08, 10, true, 8000);
insert into ids select 'old', id from public.social_events where title = 'Last week';
insert into public.social_events (host_id, title, category, starts_at, ends_at, area, lat, lng, spaces, collect_payments, total_cost_pence)
values ('00000000-0000-0000-0000-000000000001', 'Last night', 'sport', now() - interval '20 hours', now() - interval '18 hours', 'Somewhere', 51.5, -0.08, 10, true, 8000);
insert into public.plan_payments (event_id, event_title, payer_id, host_id, host_account_id, amount_pence, share_pence, fee_pence, app_fee_pence, status) values
  (pg_temp.id('old'), 'Last week', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'acct_sam', 833, 800, 33, 33, 'paid'),
  (pg_temp.id('old'), 'Last week', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'acct_sam', 833, 800, 33, 33, 'refund_requested'),
  ((select id from public.social_events where title = 'Last night'), 'Last night', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'acct_sam', 833, 800, 33, 33, 'paid');
select pg_temp.as_server();
select pg_temp.expect((select amount_pence = 800 and host_account_id = 'acct_sam' and cardinality(payment_ids) = 1 from public.payouts_due(48)),
  'Sam is paid £8 for last week''s plan; last night''s waits for 48 hours, and an open refund request waits too');
select public.payouts_mark((select payment_ids from public.payouts_due(48)), 'po_1');
select pg_temp.expect(not exists (select 1 from public.payouts_due(48)), 'and only once');

rollback;
