// Hosts' payouts (Stripe Connect Express), for Me → Payouts.
//
// Deploy:  npx supabase functions deploy stripe-connect
// Secrets: STRIPE_SECRET_KEY (see _shared/stripe.ts).
//
// Request: POST { "action": "status" | "onboard" | "dashboard" } with the
// caller's own "Authorization: Bearer <access token>".
//   status    → { state: "none" | "incomplete" | "ready", payoutsEnabled }
//   onboard   → { url } Stripe's own sign-up pages (a new account is made
//               the first time, as an individual, with as much filled in as
//               we know so Stripe only asks for the rest: date of birth,
//               home address, bank details, and ID if it needs it).
//   dashboard → { url } the host's Stripe Express dashboard (payouts, bank).
// Function never sees or stores bank details: Stripe collects them.
import { caller, dbProblem, Problem, reply, serveApp, server, SITE_URL, stripe, type Stripe } from "../_shared/stripe.ts";

type Account = Stripe.Account;

function stateOf(a: Account) {
  const ready = a.capabilities?.transfers === "active";
  const needs = (a.requirements?.currently_due?.length ?? 0) > 0 || !a.details_submitted;
  return { ready, needs, state: ready && !needs ? "ready" : "incomplete" };
}

async function save(userId: string, a: Account) {
  const s = stateOf(a);
  const { error } = await server().rpc("payout_account_save", {
    uid: userId, account: a.id, submitted: !!a.details_submitted, payouts: !!a.payouts_enabled, is_ready: s.ready, needs: s.needs,
  });
  if (error) throw dbProblem(error);
  return s;
}

serveApp("stripe-connect", async (req) => {
  const me = await caller(req);
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  const db = server();
  const { data: existing } = await db.from("payout_accounts").select("stripe_account_id").eq("user_id", me.id).maybeSingle();
  const accountId = existing?.stripe_account_id as string | undefined;

  if (action === "status") {
    if (!accountId) return reply(200, { state: "none", payoutsEnabled: false });
    const a = await stripe().accounts.retrieve(accountId);
    const s = await save(me.id, a);
    return reply(200, { state: s.state, payoutsEnabled: !!a.payouts_enabled });
  }

  if (action === "onboard") {
    const s = stripe();
    let id = accountId;
    if (!id) {
      const { data: profile } = await db.from("profiles").select("full_name, display_name").eq("id", me.id).maybeSingle();
      const full = ((profile?.full_name as string | null) ?? "").trim();
      const [first, ...rest] = full.split(/\s+/);
      const account = await s.accounts.create(
        {
          type: "express",
          country: "GB",
          email: me.email ?? undefined,
          business_type: "individual",
          // Destination charges only need transfers (Function takes the payment).
          capabilities: { transfers: { requested: true } },
          business_profile: {
            // A website isn't asked for: their Function profile is it.
            url: `https://studentfunction.com/u/${me.id}`,
            mcc: "7999", // Recreation services (events)
            product_description: "Student event host on Function",
          },
          individual: { email: me.email ?? undefined, ...(first ? { first_name: first } : {}), ...(rest.length ? { last_name: rest.join(" ") } : {}) },
          // Paid out by Function 48 hours after each plan ends (see stripe-worker).
          settings: { payouts: { schedule: { interval: "manual" } } },
          metadata: { function_user_id: me.id },
        },
        { idempotencyKey: `connect-account-${me.id}` },
      );
      await save(me.id, account);
      id = account.id;
    }
    const link = await s.accountLinks.create({
      account: id,
      type: "account_onboarding",
      collect: "currently_due",
      refresh_url: `${SITE_URL}/account/payouts?stripe=refresh`,
      return_url: `${SITE_URL}/account/payouts?stripe=done`,
    });
    return reply(200, { url: link.url });
  }

  if (action === "dashboard") {
    if (!accountId) throw new Problem("Set up payouts first");
    const login = await stripe().accounts.createLoginLink(accountId);
    return reply(200, { url: login.url });
  }

  throw new Problem("action must be status, onboard or dashboard");
});
