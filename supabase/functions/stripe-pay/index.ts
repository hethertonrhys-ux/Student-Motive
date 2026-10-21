// Paying your share of a paid Social plan.
//
// Deploy:  npx supabase functions deploy stripe-pay
// Secrets: STRIPE_SECRET_KEY (see _shared/stripe.ts).
//
// Request: POST { "eventId": "<uuid>", "mode": "sheet" | "checkout" } with
// the caller's own "Authorization: Bearer <access token>".
//   sheet    (the phone app) → { clientSecret, paymentId, amount, fee, share }
//            for Stripe's payment sheet (Apple Pay or card).
//   checkout (the website)   → { url } Stripe's hosted checkout page.
// The database checks they're going, it isn't the host, and they haven't
// paid already (paying again carries on the same payment). It's a
// destination charge: Function takes the payment and Stripe passes it to
// the host's account, less Function's application fee (the service fee).
// A payment only counts as paid once Stripe's webhook confirms it.
import { chargeFor, statementSuffix, type FeeMode } from "../_shared/payments.ts";
import { caller, dbProblem, Problem, reply, serveApp, server, SITE_URL, stripe } from "../_shared/stripe.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serveApp("stripe-pay", async (req) => {
  const me = await caller(req);
  const input = (await req.json().catch(() => ({}))) as { eventId?: string; mode?: string };
  const eventId = typeof input.eventId === "string" ? input.eventId.trim() : "";
  const mode = input.mode === "checkout" ? "checkout" : "sheet";
  if (!UUID.test(eventId)) throw new Problem("eventId must be a plan's id");

  const db = server();
  const { data: ev } = await db.from("social_events").select("id, title, cost_pence, fee_mode, collect_payments").eq("id", eventId).maybeSingle();
  if (!ev || !ev.collect_payments || !ev.cost_pence) throw new Problem("This plan doesn't take payments", 404);
  const charge = chargeFor(ev.cost_pence as number, ev.fee_mode as FeeMode);

  const { data: rows, error } = await db.rpc("payment_start", { eid: eventId, payer: me.id, amount: charge.amount, fee: charge.fee, app_fee: charge.appFee });
  if (error) throw dbProblem(error);
  const pay = (rows as { payment_id: string; payment_intent_id: string | null; checkout_session_id: string | null; host_account_id: string; event_title: string }[])[0];
  if (!pay) throw new Problem("Couldn't start the payment. Please try again.");

  const s = stripe();
  const common = {
    application_fee_amount: charge.appFee,
    transfer_data: { destination: pay.host_account_id },
    statement_descriptor_suffix: statementSuffix(pay.event_title),
    description: `${pay.event_title}: your share`,
    metadata: { payment_id: pay.payment_id, event_id: eventId, payer_id: me.id },
  };

  if (mode === "checkout") {
    if (pay.checkout_session_id) {
      const old = await s.checkout.sessions.retrieve(pay.checkout_session_id);
      if (old.status === "open" && old.url) return reply(200, { url: old.url, paymentId: pay.payment_id });
    }
    const session = await s.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [{ quantity: 1, price_data: { currency: "gbp", unit_amount: charge.amount, product_data: { name: `${pay.event_title}: your share` } } }],
        payment_intent_data: common,
        customer_email: me.email ?? undefined,
        success_url: `${SITE_URL}/social/${eventId}?paid=1`,
        cancel_url: `${SITE_URL}/social/${eventId}`,
        metadata: { payment_id: pay.payment_id },
      },
      // A new key once an old page has expired, so Stripe makes a new one.
      { idempotencyKey: `checkout-${pay.payment_id}-${pay.checkout_session_id ?? "first"}` },
    );
    await db.rpc("payment_attach", { pid: pay.payment_id, intent: null, session: session.id });
    return reply(200, { url: session.url, paymentId: pay.payment_id });
  }

  // The phone app: a PaymentIntent for the payment sheet (reused if they try again).
  if (pay.payment_intent_id) {
    const old = await s.paymentIntents.retrieve(pay.payment_intent_id);
    if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(old.status) && old.client_secret) {
      return reply(200, { clientSecret: old.client_secret, paymentId: pay.payment_id, amount: charge.amount, fee: charge.fee, share: charge.share });
    }
    if (old.status === "processing" || old.status === "succeeded") throw new Problem("Your payment is going through. It'll show as Paid in a moment.");
  }
  const intent = await s.paymentIntents.create(
    { amount: charge.amount, currency: "gbp", automatic_payment_methods: { enabled: true }, ...common },
    { idempotencyKey: `intent-${pay.payment_id}-${pay.payment_intent_id ?? "first"}` },
  );
  await db.rpc("payment_attach", { pid: pay.payment_id, intent: intent.id, session: null });
  return reply(200, { clientSecret: intent.client_secret, paymentId: pay.payment_id, amount: charge.amount, fee: charge.fee, share: charge.share });
});
