// What the Stripe functions share: the Stripe client (test mode only unless
// switched on), the database client, replies, and who's asking.
//
// Secrets (Supabase → Edge Functions → Secrets; never in the app):
//   STRIPE_SECRET_KEY       sk_test_… while testing.
//   STRIPE_LIVE_MODE        leave unset. Only "on" allows a live (sk_live_) key.
// Provided by Supabase automatically: SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY.
// Optional: SITE_URL (default https://app.studentfunction.com), where Stripe
// sends people back to after setting up payouts or paying on the website.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.7.0";

export const SITE_URL = (Deno.env.get("SITE_URL")?.trim() || "https://app.studentfunction.com").replace(/\/+$/, "");

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function reply(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: CORS });
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// A message meant for the person (raised by the database or by us) rather than a crash.
export class Problem extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export function stripe(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!key) throw new Problem("Payments aren't switched on yet.", 503);
  const test = key.startsWith("sk_test_") || key.startsWith("rk_test_");
  if (!test && Deno.env.get("STRIPE_LIVE_MODE") !== "on") {
    throw new Problem("Payments are in test mode: use a Stripe test key (sk_test_…).", 503);
  }
  // Only for automated tests against stripe-mock (never set in Supabase).
  const host = test ? Deno.env.get("STRIPE_API_HOST") : undefined;
  return new Stripe(key, {
    apiVersion: "2025-02-24.acacia",
    httpClient: Stripe.createFetchHttpClient(),
    ...(host ? { host, port: Number(Deno.env.get("STRIPE_API_PORT") ?? 12111), protocol: "http" as const } : {}),
  });
}

// The database as the server (row-level security doesn't apply: check things yourself).
export function server(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Who's asking, from their own login (Authorization: Bearer <access token>).
export async function caller(req: Request): Promise<{ id: string; email: string | null }> {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") ?? "")?.[1]?.trim();
  if (!token) throw new Problem("Log in first", 401);
  const { data, error } = await server().auth.getUser(token);
  if (error || !data.user) throw new Problem("Log in first", 401);
  return { id: data.user.id, email: data.user.email ?? null };
}

// A database error's own words when it's one of ours ("Join the plan first…").
export function dbProblem(error: { message?: string } | null): Problem | null {
  if (!error) return null;
  return new Problem(error.message ?? "Something went wrong. Please try again.");
}

// Runs a handler for app requests: CORS, POST only, and readable errors.
export function serveApp(name: string, handle: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return reply(405, { error: "Use POST" });
    try {
      return await handle(req);
    } catch (e) {
      if (e instanceof Problem) return reply(e.status, { error: e.message });
      if (e instanceof Stripe.errors.StripeError) {
        console.error(`${name}: Stripe said`, e.type, e.message);
        return reply(502, { error: e.type === "StripeCardError" ? e.message : "The payment service had a problem. Please try again." });
      }
      console.error(`${name} failed:`, errorText(e));
      return reply(500, { error: "Something went wrong. Please try again." });
    }
  });
}

export { Stripe };
