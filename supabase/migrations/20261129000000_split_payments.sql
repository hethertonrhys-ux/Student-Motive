-- =====================================================================
-- Split payments for Social plans (Stripe Connect, destination charges).
--
-- A host turns on "This event costs money" on a Social plan, enters the
-- total cost, and each person who joins pays their share (total ÷ spaces,
-- the host included) in the app. The money goes through Function's Stripe
-- account to the host's Stripe Express account, and is paid out to the
-- host's bank 48 hours after the plan ends.
--
-- What's here (the Stripe calls themselves are in supabase/functions):
--   1. payout_accounts: each host's Stripe account and whether it's ready.
--      Hosts read their own row; only the server writes it.
--   2. social_events gets collect_payments, total_cost_pence and fee_mode.
--      The price per person (cost_pence) is worked out here, and can't
--      change once anyone has paid. Collecting payments needs payouts set up.
--   3. plan_payments: one row per payment. Only the server marks a payment
--      as paid (after Stripe's webhook confirms it) or refunded.
--   4. Who's paid: plan_payment_statuses() gives the host and people going
--      a Paid / Not paid list (no amounts, no emails).
--   5. Refunds: the payer asks (plan_request_refund), only the host decides
--      (plan_decide_refund). Cancelling the plan, deleting it, or the host
--      removing someone who paid queues a refund automatically. Someone who
--      has paid can't just leave: they ask for a refund instead.
--   6. Functions for the server only (service_role): starting a payment,
--      recording what Stripe says, refunds and payouts due, and ignoring
--      webhook events already handled.
--
-- Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Hosts' Stripe accounts
-- ---------------------------------------------------------------------
create table if not exists public.payout_accounts (
  user_id           uuid primary key references public.profiles (id) on delete cascade,
  stripe_account_id text not null unique,
  details_submitted boolean not null default false,
  payouts_enabled   boolean not null default false,
  -- Ready to receive payments (Stripe's "transfers" capability is active).
  ready             boolean not null default false,
  -- What Stripe still needs, if anything (shown as "Finish setting up payouts").
  needs_info        boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.payout_accounts enable row level security;
revoke all on public.payout_accounts from anon, authenticated;
grant select on public.payout_accounts to authenticated;
drop policy if exists payout_accounts_select_own on public.payout_accounts;
create policy payout_accounts_select_own on public.payout_accounts for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 2. Paid plans
-- ---------------------------------------------------------------------
alter table public.social_events add column if not exists collect_payments boolean not null default false;
alter table public.social_events add column if not exists total_cost_pence integer
  check (total_cost_pence is null or (total_cost_pence between 100 and 1000000));
-- 'added': a service fee is added to each share, so the host gets the full share.
-- 'absorbed': people pay exactly their share and the host covers the fee.
alter table public.social_events add column if not exists fee_mode text not null default 'added';
do $$ begin
  alter table public.social_events add constraint social_events_fee_mode_check check (fee_mode in ('added', 'absorbed'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 3. Payments
-- ---------------------------------------------------------------------
create table if not exists public.plan_payments (
  id                  uuid primary key default gen_random_uuid(),
  -- Kept (as null) if the plan is deleted, so the refund can still be made.
  event_id            uuid references public.social_events (id) on delete set null,
  event_title         text not null,
  payer_id            uuid references public.profiles (id) on delete set null,
  host_id             uuid references public.profiles (id) on delete set null,
  host_account_id     text not null,
  -- What the payer is charged, the share in it, and Function's application
  -- fee (the service fee, or the Stripe fee the host absorbs, plus any
  -- Function platform fee). The host gets amount_pence - app_fee_pence.
  amount_pence        integer not null check (amount_pence >= 30),
  share_pence         integer not null check (share_pence > 0),
  fee_pence           integer not null default 0 check (fee_pence >= 0),
  app_fee_pence       integer not null default 0 check (app_fee_pence >= 0 and app_fee_pence < amount_pence),
  currency            text not null default 'gbp',
  status              text not null default 'pending' check (status in (
                        'pending',          -- payment started, not finished
                        'failed',           -- the card was declined etc.
                        'cancelled',        -- abandoned (e.g. they left before paying)
                        'paid',             -- Stripe confirmed it
                        'refund_requested', -- the payer asked; the host decides
                        'refund_declined',  -- the host said no (still paid)
                        'refund_queued',    -- waiting to be sent to Stripe
                        'refund_pending',   -- sent to Stripe, waiting for it to confirm
                        'refund_failed',    -- Stripe couldn't refund (the Function team is emailed)
                        'refunded')),
  -- Why it's being refunded: the host approved, the plan was cancelled or
  -- deleted, the payer was removed, or they paid without a place.
  refund_cause        text check (refund_cause in ('host_approved', 'cancelled', 'deleted', 'removed', 'not_going')),
  refund_reason       text check (char_length(refund_reason) <= 500),
  payment_intent_id   text unique,
  checkout_session_id text unique,
  stripe_refund_id    text unique,
  failure_message     text,
  paid_at             timestamptz,
  refund_requested_at timestamptz,
  refund_decided_at   timestamptz,
  refunded_at         timestamptz,
  paid_out_at         timestamptz,
  payout_id           text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists plan_payments_event_idx on public.plan_payments (event_id);
create index if not exists plan_payments_host_idx on public.plan_payments (host_id);
create index if not exists plan_payments_queue_idx on public.plan_payments (status) where status in ('refund_queued', 'paid', 'refund_declined');
-- One live payment per person per plan: paying twice reuses it. (A payment
-- on its way back to them doesn't count, so they can join again and pay.)
drop index if exists public.plan_payments_one_live;
create unique index plan_payments_one_live on public.plan_payments (event_id, payer_id)
  where status in ('pending', 'paid', 'refund_requested', 'refund_declined', 'refund_failed');
alter table public.plan_payments enable row level security;
revoke all on public.plan_payments from anon, authenticated;
grant select on public.plan_payments to authenticated;
drop policy if exists plan_payments_select on public.plan_payments;
create policy plan_payments_select on public.plan_payments for select to authenticated
  using (payer_id = (select auth.uid()) or host_id = (select auth.uid()));

-- Stripe sends some webhook events more than once: each is handled once.
create table if not exists public.stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- Payment notifications ("Sam paid £8", refund news) are their own kind,
-- always sent (they're about people's money, so there's no switch to turn them off).
alter table public.push_queue drop constraint if exists push_queue_kind_check;
alter table public.push_queue add constraint push_queue_kind_check
  check (kind in ('messages', 'friends', 'society_events', 'reminders', 'hosting', 'seating', 'hub', 'payments'));

-- Statuses that still hold the payer's money.
create or replace function public.payment_is_held(s text)
returns boolean language sql immutable set search_path = '' as $$
  select s in ('paid', 'refund_requested', 'refund_declined', 'refund_failed');
$$;

-- ---------------------------------------------------------------------
-- 2b. The price per person, worked out here; locked once anyone has paid
-- ---------------------------------------------------------------------
create or replace function public.social_payment_fields()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.collect_payments then
    if new.total_cost_pence is null then raise exception 'Enter the total cost'; end if;
    -- Everyone pays the same share, the host included; rounded up to the penny.
    new.cost_pence := ceil(new.total_cost_pence::numeric / new.spaces)::integer;
    if new.cost_pence < 100 then raise exception 'Each person''s share must be at least £1'; end if;
    if tg_op = 'INSERT' or not old.collect_payments then
      if not exists (select 1 from public.payout_accounts a where a.user_id = new.host_id and a.ready) then
        raise exception 'Set up payouts first (Me → Payouts) so the money can reach your bank account';
      end if;
    end if;
  end if;
  if tg_op = 'UPDATE'
     and (new.collect_payments is distinct from old.collect_payments
          or new.cost_pence is distinct from old.cost_pence
          or new.fee_mode is distinct from old.fee_mode)
     and exists (select 1 from public.plan_payments p
                 where p.event_id = old.id and (public.payment_is_held(p.status) or p.status = 'pending')) then
    raise exception 'People have already paid, so the price and number of spaces can''t change';
  end if;
  return new;
end;
$$;
revoke execute on function public.social_payment_fields() from public, anon, authenticated;
drop trigger if exists social_events_payment_fields on public.social_events;
create trigger social_events_payment_fields before insert or update on public.social_events
  for each row execute function public.social_payment_fields();

-- ---------------------------------------------------------------------
-- 4. Who's paid (for the host and people going)
-- ---------------------------------------------------------------------
create or replace function public.plan_payment_statuses(eid uuid)
returns table (user_id uuid, status text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (public.social_is_host(eid) or public.social_is_going(eid)) then return; end if;
  return query
    select m.user_id,
      coalesce((select case when public.payment_is_held(p.status) then 'paid'
                            when p.status in ('refund_queued', 'refund_pending') then 'refunding'
                            else 'unpaid' end
                from public.plan_payments p
                where p.event_id = eid and p.payer_id = m.user_id
                order by p.created_at desc limit 1), 'unpaid')
    from public.social_event_members m
    where m.event_id = eid and m.status = 'going';
end;
$$;
revoke execute on function public.plan_payment_statuses(uuid) from public, anon;
grant execute on function public.plan_payment_statuses(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Refunds
-- ---------------------------------------------------------------------
create or replace function public.plan_request_refund(eid uuid, reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  pay public.plan_payments;
begin
  if auth.uid() is null then raise exception 'Log in first'; end if;
  select * into pay from public.plan_payments
  where event_id = eid and payer_id = auth.uid() and status in ('paid', 'refund_declined')
  order by created_at desc limit 1 for update;
  if not found then raise exception 'There''s no payment to refund'; end if;
  update public.plan_payments
  set status = 'refund_requested', refund_reason = nullif(trim(coalesce(reason, '')), ''),
      refund_requested_at = now(), refund_decided_at = null, updated_at = now()
  where id = pay.id;
  perform public.queue_push(pay.host_id, 'payments', 'Refund request',
    public.push_name(pay.payer_id) || ' asked for a refund for ' || pay.event_title || '. Approve or decline it on the plan.',
    '/social/' || eid, 'refund-request:' || pay.id || ':' || extract(epoch from now())::bigint);
end;
$$;
revoke execute on function public.plan_request_refund(uuid, text) from public, anon;
grant execute on function public.plan_request_refund(uuid, text) to authenticated;

create or replace function public.plan_decide_refund(pid uuid, approve boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  pay public.plan_payments;
begin
  select * into pay from public.plan_payments where id = pid for update;
  if not found or pay.host_id is distinct from auth.uid() then raise exception 'Only the host can do that'; end if;
  if pay.status <> 'refund_requested' then raise exception 'There''s no refund request to answer'; end if;
  if approve then
    update public.plan_payments set status = 'refund_queued', refund_cause = 'host_approved', refund_decided_at = now(), updated_at = now() where id = pid;
  else
    update public.plan_payments set status = 'refund_declined', refund_decided_at = now(), updated_at = now() where id = pid;
    perform public.queue_push(pay.payer_id, 'payments', 'Refund declined',
      'The host declined your refund for ' || pay.event_title || '. Your place is kept.',
      case when pay.event_id is null then null else '/social/' || pay.event_id end, 'refund-declined:' || pid);
  end if;
end;
$$;
revoke execute on function public.plan_decide_refund(uuid, boolean) from public, anon;
grant execute on function public.plan_decide_refund(uuid, boolean) to authenticated;

-- Someone who has paid asks for a refund instead of just leaving.
create or replace function public.social_leave(eid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.plan_payments p
             where p.event_id = eid and p.payer_id = (select auth.uid()) and public.payment_is_held(p.status)) then
    raise exception 'You''ve paid for this, so ask the host for a refund instead (Request refund)';
  end if;
  delete from public.social_event_members
  where event_id = eid and user_id = (select auth.uid()) and status in ('going', 'pending');
end;
$$;

-- Removed (or left before paying): refund what they paid, drop an unfinished payment.
create or replace function public.payment_on_member_gone()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.plan_payments
  set status = 'refund_queued', refund_cause = coalesce(refund_cause, 'removed'), updated_at = now()
  where event_id = old.event_id and payer_id = old.user_id and public.payment_is_held(status);
  update public.plan_payments
  set status = 'cancelled', updated_at = now()
  where event_id = old.event_id and payer_id = old.user_id and status = 'pending';
  return old;
end;
$$;
revoke execute on function public.payment_on_member_gone() from public, anon, authenticated;
drop trigger if exists social_member_gone_refund on public.social_event_members;
create trigger social_member_gone_refund after delete on public.social_event_members
  for each row execute function public.payment_on_member_gone();

-- The host cancels the plan: everyone who paid is refunded.
create or replace function public.payment_on_plan_cancelled()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.is_cancelled and not old.is_cancelled then
    update public.plan_payments
    set status = 'refund_queued', refund_cause = 'cancelled', updated_at = now()
    where event_id = new.id and (public.payment_is_held(status) or status = 'refund_requested');
    update public.plan_payments set status = 'cancelled', updated_at = now()
    where event_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;
revoke execute on function public.payment_on_plan_cancelled() from public, anon, authenticated;
drop trigger if exists social_event_cancelled_refund on public.social_events;
create trigger social_event_cancelled_refund after update of is_cancelled on public.social_events
  for each row execute function public.payment_on_plan_cancelled();

-- The plan is deleted: the same (the payment rows stay, without the plan).
create or replace function public.payment_on_plan_deleted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.plan_payments
  set status = 'refund_queued', refund_cause = 'deleted', updated_at = now()
  where event_id = old.id and public.payment_is_held(status);
  update public.plan_payments set status = 'cancelled', updated_at = now()
  where event_id = old.id and status = 'pending';
  return old;
end;
$$;
revoke execute on function public.payment_on_plan_deleted() from public, anon, authenticated;
drop trigger if exists social_event_deleted_refund on public.social_events;
create trigger social_event_deleted_refund before delete on public.social_events
  for each row execute function public.payment_on_plan_deleted();

-- ---------------------------------------------------------------------
-- 6. For the server only (the Stripe functions, as service_role)
-- ---------------------------------------------------------------------

-- Save what Stripe says about a host's account.
create or replace function public.payout_account_save(uid uuid, account text, submitted boolean, payouts boolean, is_ready boolean, needs boolean)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.payout_accounts (user_id, stripe_account_id, details_submitted, payouts_enabled, ready, needs_info)
  values (uid, account, submitted, payouts, is_ready, needs)
  on conflict (user_id) do update set stripe_account_id = excluded.stripe_account_id, details_submitted = excluded.details_submitted,
    payouts_enabled = excluded.payouts_enabled, ready = excluded.ready, needs_info = excluded.needs_info, updated_at = now();
$$;

-- Start (or carry on) a payment: checks they're going and haven't paid, and
-- returns the payment to use. Paying twice gets the same payment back.
create or replace function public.payment_start(eid uuid, payer uuid, amount integer, fee integer, app_fee integer)
returns table (payment_id uuid, status text, payment_intent_id text, checkout_session_id text, host_account_id text, event_title text, amount_pence integer)
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.social_events;
  acct text;
  pay public.plan_payments;
begin
  select * into ev from public.social_events where id = eid for update;
  if not found or ev.is_hidden then raise exception 'This plan isn''t available'; end if;
  if not ev.collect_payments then raise exception 'This plan doesn''t take payments'; end if;
  if ev.is_cancelled then raise exception 'This plan was cancelled'; end if;
  if ev.ends_at < now() then raise exception 'This plan has finished'; end if;
  if ev.host_id = payer then raise exception 'You''re the host, so you don''t pay'; end if;
  if not exists (select 1 from public.social_event_members m where m.event_id = eid and m.user_id = payer and m.status = 'going') then
    raise exception 'Join the plan first, then pay';
  end if;
  select a.stripe_account_id into acct from public.payout_accounts a where a.user_id = ev.host_id and a.ready;
  if acct is null then raise exception 'The host hasn''t finished setting up payouts yet'; end if;

  select * into pay from public.plan_payments p
  where p.event_id = eid and p.payer_id = payer
    and p.status in ('pending', 'paid', 'refund_requested', 'refund_declined', 'refund_failed')
  for update;
  if found then
    if pay.status <> 'pending' then raise exception 'You''ve already paid for this'; end if;
    -- An unfinished payment for a different amount (can't happen once the price is locked) starts again.
    if pay.amount_pence <> amount then
      update public.plan_payments set status = 'cancelled', updated_at = now() where id = pay.id;
    else
      return query select pay.id, pay.status, pay.payment_intent_id, pay.checkout_session_id, pay.host_account_id, pay.event_title, pay.amount_pence;
      return;
    end if;
  end if;
  insert into public.plan_payments (event_id, event_title, payer_id, host_id, host_account_id, amount_pence, share_pence, fee_pence, app_fee_pence)
  values (eid, ev.title, payer, ev.host_id, acct, amount, ev.cost_pence, fee, app_fee)
  returning * into pay;
  return query select pay.id, pay.status, pay.payment_intent_id, pay.checkout_session_id, pay.host_account_id, pay.event_title, pay.amount_pence;
end;
$$;

create or replace function public.payment_attach(pid uuid, intent text, session text)
returns void
language sql security definer set search_path = ''
as $$
  update public.plan_payments
  set payment_intent_id = coalesce(intent, payment_intent_id), checkout_session_id = coalesce(session, checkout_session_id), updated_at = now()
  where id = pid;
$$;

-- Stripe confirmed the payment (webhook). Tells the host; if they're no
-- longer going (or the plan was cancelled meanwhile), refunds it.
create or replace function public.payment_mark_paid(pid uuid, intent text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  pay public.plan_payments;
  ev public.social_events;
begin
  select * into pay from public.plan_payments where id = pid or (pid is null and payment_intent_id = intent) for update;
  if not found then return 'unknown'; end if;
  if pay.status not in ('pending', 'failed', 'cancelled') then return pay.status; end if;
  update public.plan_payments
  set status = 'paid', paid_at = now(), payment_intent_id = coalesce(intent, payment_intent_id), failure_message = null, updated_at = now()
  where id = pay.id;
  select * into ev from public.social_events where id = pay.event_id;
  if ev.id is null or ev.is_cancelled
     or not exists (select 1 from public.social_event_members m where m.event_id = pay.event_id and m.user_id = pay.payer_id and m.status = 'going')
     or exists (select 1 from public.plan_payments o where o.id <> pay.id and o.event_id = pay.event_id and o.payer_id = pay.payer_id and public.payment_is_held(o.status)) then
    update public.plan_payments set status = 'refund_queued', refund_cause = case when ev.is_cancelled then 'cancelled' else 'not_going' end, updated_at = now()
    where id = pay.id;
    return 'refund_queued';
  end if;
  perform public.queue_push(pay.host_id, 'payments', 'Payment received',
    public.push_name(pay.payer_id) || ' paid £' || to_char(pay.share_pence / 100.0, 'FM999990.00') || ' for ' || pay.event_title,
    '/social/' || pay.event_id, 'paid:' || pay.id);
  return 'paid';
end;
$$;

create or replace function public.payment_mark_failed(pid uuid, intent text, message text)
returns void
language sql security definer set search_path = ''
as $$
  update public.plan_payments
  set status = 'failed', failure_message = left(message, 300), updated_at = now()
  where (id = pid or (pid is null and payment_intent_id = intent)) and status = 'pending';
$$;

-- Refunds waiting to be sent to Stripe.
create or replace function public.payment_refunds_due()
returns table (payment_id uuid, payment_intent_id text, amount_pence integer, refund_cause text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.payment_intent_id, p.amount_pence, p.refund_cause from public.plan_payments p
  where p.status = 'refund_queued' and p.payment_intent_id is not null
  order by p.updated_at limit 50;
$$;

create or replace function public.payment_refund_started(pid uuid, refund text)
returns void
language sql security definer set search_path = ''
as $$
  update public.plan_payments set status = 'refund_pending', stripe_refund_id = refund, updated_at = now()
  where id = pid and status = 'refund_queued';
$$;

-- Stripe confirmed the refund (webhook). The payer is told; after a
-- refund the host approved, they leave the plan.
create or replace function public.payment_mark_refunded(pid uuid, intent text, refund text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  pay public.plan_payments;
begin
  select * into pay from public.plan_payments where id = pid or (pid is null and payment_intent_id = intent) for update;
  if not found or pay.status = 'refunded' then return; end if;
  update public.plan_payments
  set status = 'refunded', stripe_refund_id = coalesce(refund, stripe_refund_id), refunded_at = now(), updated_at = now()
  where id = pay.id;
  if pay.refund_cause = 'host_approved' and pay.event_id is not null then
    delete from public.social_event_members where event_id = pay.event_id and user_id = pay.payer_id;
  end if;
  perform public.queue_push(pay.payer_id, 'payments', 'Refund on its way',
    '£' || to_char(pay.amount_pence / 100.0, 'FM999990.00') || ' for ' || pay.event_title || ' is being refunded to your card. It can take 5 to 10 days to show.',
    case when pay.event_id is null then null else '/social/' || pay.event_id end, 'refunded:' || pay.id);
end;
$$;

-- Stripe couldn't refund: the money stays put and the Function team is emailed.
create or replace function public.payment_refund_failed(pid uuid, intent text, message text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  pay public.plan_payments;
begin
  select * into pay from public.plan_payments where id = pid or (pid is null and payment_intent_id = intent) for update;
  if not found then return; end if;
  update public.plan_payments set status = 'refund_failed', failure_message = left(message, 300), updated_at = now() where id = pay.id;
  insert into public.email_queue (to_address, subject, body)
  values (public.report_email_address(), '[Function payments] A refund failed',
          'A refund failed and needs a look in the Stripe dashboard.' || chr(10) || chr(10)
          || 'Plan: ' || pay.event_title || chr(10) || 'Payment id: ' || pay.id || chr(10)
          || 'Stripe payment: ' || coalesce(pay.payment_intent_id, '-') || chr(10) || 'Stripe said: ' || coalesce(message, '-'));
end;
$$;

-- A payer disputed a charge with their bank (Function is liable): email the team.
create or replace function public.payment_disputed(intent text, amount integer, reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  pay public.plan_payments;
begin
  select * into pay from public.plan_payments where payment_intent_id = intent;
  insert into public.email_queue (to_address, subject, body)
  values (public.report_email_address(), '[Function payments] A payment was disputed',
          'Someone disputed a payment with their bank. Respond in the Stripe dashboard (Payments → Disputes) before the deadline.' || chr(10) || chr(10)
          || 'Plan: ' || coalesce(pay.event_title, '(unknown)') || chr(10) || 'Payment id: ' || coalesce(pay.id::text, '-') || chr(10)
          || 'Stripe payment: ' || coalesce(intent, '-') || chr(10) || 'Amount: £' || to_char(coalesce(amount, 0) / 100.0, 'FM999990.00') || chr(10)
          || 'Reason: ' || coalesce(reason, '-'));
end;
$$;

-- Hosts to pay out: money for plans that ended more than hold_hours ago,
-- still held (refund requests not yet answered wait), not yet paid out.
create or replace function public.payouts_due(hold_hours integer default 48)
returns table (host_id uuid, host_account_id text, amount_pence integer, payment_ids uuid[])
language sql stable security definer set search_path = ''
as $$
  select p.host_id, p.host_account_id, sum(p.amount_pence - p.app_fee_pence)::integer, array_agg(p.id)
  from public.plan_payments p
  join public.social_events e on e.id = p.event_id
  where p.status in ('paid', 'refund_declined') and p.paid_out_at is null
    and e.ends_at < now() - make_interval(hours => hold_hours)
  group by p.host_id, p.host_account_id;
$$;

create or replace function public.payouts_mark(ids uuid[], payout text)
returns void
language sql security definer set search_path = ''
as $$
  update public.plan_payments set paid_out_at = now(), payout_id = payout, updated_at = now() where id = any(ids) and paid_out_at is null;
$$;

-- Each webhook event once: true the first time.
create or replace function public.stripe_event_first(event_id text, event_type text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.stripe_events (id, type) values (event_id, event_type);
  return true;
exception when unique_violation then
  return false;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.payout_account_save(uuid, text, boolean, boolean, boolean, boolean)',
    'public.payment_start(uuid, uuid, integer, integer, integer)',
    'public.payment_attach(uuid, text, text)',
    'public.payment_mark_paid(uuid, text)',
    'public.payment_mark_failed(uuid, text, text)',
    'public.payment_refunds_due()',
    'public.payment_refund_started(uuid, text)',
    'public.payment_mark_refunded(uuid, text, text)',
    'public.payment_refund_failed(uuid, text, text)',
    'public.payment_disputed(text, integer, text)',
    'public.payouts_due(integer)',
    'public.payouts_mark(uuid[], text)',
    'public.stripe_event_first(text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
