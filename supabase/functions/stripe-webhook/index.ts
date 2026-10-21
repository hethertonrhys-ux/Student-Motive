// Stripe tells Function what happened (webhooks). This is the only thing
// that marks a payment as paid or refunded.
//
// Deploy:  npx supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (the endpoint for
//          Function's own account: payments, refunds, disputes) and
//          STRIPE_CONNECT_WEBHOOK_SECRET (the endpoint for connected
//          accounts: hosts' account.updated).
// Every event's signature is checked; each event is handled once.
import { errorText, server, Stripe, stripe } from "../_shared/stripe.ts";

const cryptoProvider = Stripe.createSubtleCryptoProvider();

async function verify(body: string, signature: string): Promise<Stripe.Event | null> {
  const s = stripe();
  for (const secret of [Deno.env.get("STRIPE_WEBHOOK_SECRET"), Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET")]) {
    if (!secret) continue;
    try {
      return await s.webhooks.constructEventAsync(body, signature, secret, undefined, cryptoProvider);
    } catch {
      // Try the other endpoint's secret.
    }
  }
  return null;
}

async function call(fn: string, args: Record<string, unknown>) {
  const { error } = await server().rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
}

async function handle(event: Stripe.Event) {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await call("payment_mark_paid", { pid: pi.metadata?.payment_id || null, intent: pi.id });
      break;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await call("payment_mark_failed", { pid: pi.metadata?.payment_id || null, intent: pi.id, message: pi.last_payment_error?.message ?? "The payment didn't go through." });
      break;
    }
    case "checkout.session.completed": {
      // The website's checkout: the payment itself is confirmed by
      // payment_intent.succeeded; this links the session to its payment.
      const cs = event.data.object as Stripe.Checkout.Session;
      const pid = cs.metadata?.payment_id;
      const intent = typeof cs.payment_intent === "string" ? cs.payment_intent : cs.payment_intent?.id;
      if (pid && intent) await call("payment_attach", { pid, intent, session: cs.id });
      if (pid && intent && cs.payment_status === "paid") await call("payment_mark_paid", { pid, intent });
      break;
    }
    case "charge.refunded": {
      const ch = event.data.object as Stripe.Charge;
      const intent = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
      if (ch.refunded && intent) await call("payment_mark_refunded", { pid: ch.metadata?.payment_id || null, intent, refund: ch.refunds?.data?.[0]?.id ?? null });
      break;
    }
    case "refund.updated":
    case "refund.failed": {
      const r = event.data.object as Stripe.Refund;
      const intent = typeof r.payment_intent === "string" ? r.payment_intent : r.payment_intent?.id;
      if (r.status === "failed" && intent) await call("payment_refund_failed", { pid: r.metadata?.payment_id || null, intent, message: r.failure_reason ?? "failed" });
      break;
    }
    case "charge.dispute.created": {
      const d = event.data.object as Stripe.Dispute;
      const intent = typeof d.payment_intent === "string" ? d.payment_intent : d.payment_intent?.id;
      await call("payment_disputed", { intent: intent ?? null, amount: d.amount, reason: d.reason });
      break;
    }
    case "account.updated": {
      const a = event.data.object as Stripe.Account;
      const uid = a.metadata?.function_user_id;
      if (uid) {
        const ready = a.capabilities?.transfers === "active";
        const needs = (a.requirements?.currently_due?.length ?? 0) > 0 || !a.details_submitted;
        await call("payout_account_save", { uid, account: a.id, submitted: !!a.details_submitted, payouts: !!a.payouts_enabled, is_ready: ready, needs });
      }
      break;
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("No signature", { status: 400 });
  const body = await req.text();
  let event: Stripe.Event | null;
  try {
    event = await verify(body, signature);
  } catch (e) {
    console.error("stripe-webhook:", errorText(e));
    return new Response("Not set up", { status: 500 });
  }
  if (!event) return new Response("Bad signature", { status: 400 });
  try {
    const { data: first, error } = await server().rpc("stripe_event_first", { event_id: event.id, event_type: event.type });
    if (error) throw new Error(error.message);
    if (!first) return Response.json({ received: true, duplicate: true });
    try {
      await handle(event);
    } catch (e) {
      // Let Stripe send it again later.
      await server().from("stripe_events").delete().eq("id", event.id);
      throw e;
    }
    return Response.json({ received: true });
  } catch (e) {
    console.error(`stripe-webhook ${event.type} failed:`, errorText(e));
    return new Response("Failed", { status: 500 });
  }
});
