// Every minute (pg_cron, see supabase/RUN_ONCE_payments_cron.sql):
//   1. Sends queued refunds to Stripe: refunds the host approved, and the
//      automatic ones (plan cancelled or deleted, someone who paid was
//      removed, or paid without a place). The whole amount goes back to the
//      payer's card or Apple Pay, taken back from the host's Stripe balance.
//      Stripe's webhook then confirms each one.
//   2. Pays hosts out: money for plans that ended 48 hours ago or more goes
//      from their Stripe balance to their bank (their payouts are manual,
//      so nothing leaves before then).
//
// Deploy:  npx supabase functions deploy stripe-worker --no-verify-jwt
// Secrets: STRIPE_SECRET_KEY, PAYMENTS_WORKER_SECRET (any long random
//          password; the cron job sends it as x-worker-secret).
import { PAYOUT_HOLD_HOURS } from "../_shared/payments.ts";
import { errorText, server, Stripe, stripe } from "../_shared/stripe.ts";

type Due = { payment_id: string; payment_intent_id: string; amount_pence: number; refund_cause: string };
type Payout = { host_id: string; host_account_id: string; amount_pence: number; payment_ids: string[] };

Deno.serve(async (req) => {
  const secret = Deno.env.get("PAYMENTS_WORKER_SECRET");
  if (!secret || req.headers.get("x-worker-secret") !== secret) return new Response("Forbidden", { status: 403 });
  try {
    return Response.json(await run());
  } catch (e) {
    console.error("stripe-worker failed:", errorText(e));
    return Response.json({ error: errorText(e) }, { status: 500 });
  }
});

async function run() {
  const db = server();
  const s = stripe();
  const done = { refunds: 0, refundErrors: [] as string[], payouts: 0, payoutsWaiting: 0 };

  const { data: due, error } = await db.rpc("payment_refunds_due");
  if (error) throw new Error(error.message);
  for (const r of (due ?? []) as Due[]) {
    try {
      const refund = await s.refunds.create(
        { payment_intent: r.payment_intent_id, reverse_transfer: true, refund_application_fee: true, metadata: { payment_id: r.payment_id, cause: r.refund_cause } },
        { idempotencyKey: `refund-${r.payment_id}` },
      );
      await db.rpc("payment_refund_started", { pid: r.payment_id, refund: refund.id });
      done.refunds += 1;
    } catch (e) {
      const message = e instanceof Stripe.errors.StripeError ? `${e.code ?? e.type}: ${e.message}` : errorText(e);
      // Already refunded at Stripe (e.g. by hand in the dashboard): record it.
      if (e instanceof Stripe.errors.StripeError && e.code === "charge_already_refunded") {
        await db.rpc("payment_mark_refunded", { pid: r.payment_id, intent: r.payment_intent_id, refund: null });
      } else if (e instanceof Stripe.errors.StripeInvalidRequestError) {
        await db.rpc("payment_refund_failed", { pid: r.payment_id, intent: r.payment_intent_id, message });
      }
      done.refundErrors.push(`${r.payment_id}: ${message}`);
    }
  }

  const { data: payouts, error: payoutError } = await db.rpc("payouts_due", { hold_hours: PAYOUT_HOLD_HOURS });
  if (payoutError) throw new Error(payoutError.message);
  for (const p of (payouts ?? []) as Payout[]) {
    if (p.amount_pence <= 0) continue;
    try {
      const payout = await s.payouts.create(
        { amount: p.amount_pence, currency: "gbp", description: "Function plans", metadata: { function_host_id: p.host_id } },
        { stripeAccount: p.host_account_id, idempotencyKey: `payout-${[...p.payment_ids].sort().join(",").slice(0, 200)}` },
      );
      await db.rpc("payouts_mark", { ids: p.payment_ids, payout: payout.id });
      done.payouts += 1;
    } catch (e) {
      // Money from card payments takes a few days to be available in Stripe: try again later.
      if (e instanceof Stripe.errors.StripeError && e.code === "balance_insufficient") done.payoutsWaiting += 1;
      else console.error("stripe-worker payout:", p.host_account_id, errorText(e));
    }
  }
  return done;
}
