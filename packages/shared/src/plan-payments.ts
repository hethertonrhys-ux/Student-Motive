import type { SupabaseClient } from "@supabase/supabase-js";

// Paid Social plans, for the app: hosts' payouts (Stripe Connect Express),
// paying a share, refunds, and who has paid. The Stripe calls are made by
// the server functions in supabase/functions (stripe-connect, stripe-pay);
// the rest is the database's own rules (20261129000000_split_payments.sql).

export type PayoutState = "none" | "incomplete" | "ready";
export type PaidStatus = "paid" | "refunding" | "unpaid";

export type MyPayment = {
  id: string;
  status: "pending" | "failed" | "cancelled" | "paid" | "refund_requested" | "refund_declined" | "refund_queued" | "refund_pending" | "refund_failed" | "refunded";
  amount_pence: number;
  share_pence: number;
  fee_pence: number;
  refund_reason: string | null;
  failure_message: string | null;
};

export type HostPayment = MyPayment & { payer_id: string | null; app_fee_pence: number; paid_out_at: string | null };

// The error a server function sent back ({ error: "..." }), in its own words.
async function functionError(error: unknown, fallback: string): Promise<string> {
  try {
    const body = (await (error as { context?: Response }).context?.json()) as { error?: unknown } | null;
    if (typeof body?.error === "string" && body.error) return body.error;
  } catch {
    // Not JSON.
  }
  return fallback;
}

async function call<T>(supabase: SupabaseClient, name: string, body: Record<string, unknown>, fallback: string): Promise<T | { error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) return { error: await functionError(error, fallback) };
    return data as T;
  } catch {
    return { error: fallback };
  }
}

// ---- Hosts: payouts ----

export async function loadPayoutState(supabase: SupabaseClient): Promise<{ state: PayoutState; payoutsEnabled: boolean } | { error: string }> {
  return call(supabase, "stripe-connect", { action: "status" }, "Couldn't check your payouts. Please try again.");
}

// Stripe's own sign-up pages (bank details and ID are given to Stripe, never to Function).
export async function payoutSetupLink(supabase: SupabaseClient): Promise<{ url: string } | { error: string }> {
  return call(supabase, "stripe-connect", { action: "onboard" }, "Couldn't open payouts set-up. Please try again.");
}

// The host's Stripe Express dashboard: payouts and their bank account.
export async function payoutDashboardLink(supabase: SupabaseClient): Promise<{ url: string } | { error: string }> {
  return call(supabase, "stripe-connect", { action: "dashboard" }, "Couldn't open your Stripe dashboard. Please try again.");
}

// Whether payouts are ready, from the database (no Stripe call): for the
// plan form and the Me row.
export async function payoutsReady(supabase: SupabaseClient, myId: string): Promise<PayoutState> {
  const { data } = await supabase.from("payout_accounts").select("ready, needs_info").eq("user_id", myId).maybeSingle();
  if (!data) return "none";
  return data.ready && !data.needs_info ? "ready" : "incomplete";
}

// ---- Paying ----

export type SheetPayment = { clientSecret: string; paymentId: string; amount: number; fee: number; share: number };

// The phone app: a payment for Stripe's payment sheet (Apple Pay or card).
export async function startSheetPayment(supabase: SupabaseClient, eventId: string): Promise<SheetPayment | { error: string }> {
  return call(supabase, "stripe-pay", { eventId, mode: "sheet" }, "Couldn't start the payment. Please try again.");
}

// The website: Stripe's hosted checkout page.
export async function startCheckout(supabase: SupabaseClient, eventId: string): Promise<{ url: string } | { error: string }> {
  return call(supabase, "stripe-pay", { eventId, mode: "checkout" }, "Couldn't start the payment. Please try again.");
}

// ---- Who's paid, and your own payment ----

export type PlanPayments = {
  // Everyone going (not the host): paid, being refunded, or not paid yet.
  statuses: Map<string, PaidStatus>;
  // Your latest payment for this plan (if you're going).
  mine: MyPayment | null;
  // The host's view: every payment for the plan.
  all: HostPayment[];
};

export async function loadPlanPayments(supabase: SupabaseClient, eventId: string, myId: string | null, isHost: boolean): Promise<PlanPayments> {
  if (!myId) return { statuses: new Map(), mine: null, all: [] };
  const fields = "id, status, amount_pence, share_pence, fee_pence, refund_reason, failure_message, payer_id, app_fee_pence, paid_out_at, created_at";
  const [statuses, mine, all] = await Promise.all([
    supabase.rpc("plan_payment_statuses", { eid: eventId }),
    isHost ? Promise.resolve({ data: null }) : supabase.from("plan_payments").select(fields).eq("event_id", eventId).eq("payer_id", myId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    isHost ? supabase.from("plan_payments").select(fields).eq("event_id", eventId).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  return {
    statuses: new Map(((statuses.data ?? []) as { user_id: string; status: PaidStatus }[]).map((r) => [r.user_id, r.status])),
    mine: (mine.data as MyPayment | null) ?? null,
    all: (all.data ?? []) as HostPayment[],
  };
}

// ---- Refunds ----

export async function requestRefund(supabase: SupabaseClient, eventId: string, reason: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("plan_request_refund", { eid: eventId, reason: reason.trim().slice(0, 500) || null });
  return error ? { error: error.message || "Couldn't ask for a refund. Please try again." } : {};
}

// Only the host can answer (the database checks).
export async function decideRefund(supabase: SupabaseClient, paymentId: string, approve: boolean): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("plan_decide_refund", { pid: paymentId, approve });
  return error ? { error: error.message || "Couldn't answer the refund request. Please try again." } : {};
}

// Statuses that mean "you've paid" for the payer.
export function isPaid(status: MyPayment["status"] | undefined): boolean {
  return status === "paid" || status === "refund_requested" || status === "refund_declined" || status === "refund_failed";
}
