// Sends queued push notifications: Expo's push service for the iPhone and
// Android apps, Web Push (VAPID) for the home-screen web app.
//
// Deploy:  supabase functions deploy send-push --no-verify-jwt
// Secrets: supabase secrets set PUSH_SECRET=... VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:help@studentfunction.com
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)
// Called straight away when notifications are queued (the push_queue_kick
// trigger, set up by RUN_ONCE_instant_push.sql), and every minute by pg_cron
// as the backup (RUN_ONCE_push_cron.sql), with the x-push-secret header.
//
// Each run keeps claiming notifications (up to 1,000 at a time, with
// claim_push_batch, so two runs at once never send the same one twice) until
// the queue is empty or about 50 seconds have passed. Each claim goes to Expo
// in requests of up to 100 messages, several at once (a request Expo turns
// away as too many at once is sent again after a short wait). Phones and browsers
// that no longer exist are forgotten. A notification that couldn't be sent
// at all (Expo or the network was down) goes back in the queue for the next
// run, up to 3 tries. At the end, notifications sent more than a week ago
// are tidied away (purge_push_queue).
//
// Any failure is returned as JSON ({ "error": "..." }) so it can be read from
// net._http_response.content or the function's Logs tab.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  chunk,
  CLAIM_SIZE,
  type Delivery,
  EXPO_BATCH,
  EXPO_PARALLEL,
  ID_CHUNK,
  mapLimit,
  MAX_ATTEMPTS,
  planDeliveries,
  type QueueRow,
  readExpoAnswer,
  RUN_BUDGET_MS,
  sendExpoRequest,
  settle,
  type TokenRow,
  WEB_PARALLEL,
  type WebJob,
  webOutcome,
} from "./batching.ts";

type WebPush = {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(subscription: unknown, payload: string, options?: { TTL?: number }): Promise<unknown>;
};

const SITE = Deno.env.get("SITE_URL")?.trim() || "https://studentfunction.com";

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

Deno.serve(async (req) => {
  if (req.headers.get("x-push-secret") !== Deno.env.get("PUSH_SECRET")) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    return Response.json(await run());
  } catch (e) {
    const message = errorText(e);
    console.error("send-push failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
});

// Loads web-push only when there is something to send to a browser, so a bad
// VAPID key or a missing package can never stop the iPhone/Android sends.
async function loadWebPush(errors: string[]): Promise<WebPush | null> {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")?.trim();
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")?.trim();
  if (!publicKey || !privateKey) {
    errors.push("web push not configured (VAPID keys missing)");
    return null;
  }
  try {
    const mod = (await import("npm:web-push@3")) as { default?: WebPush } & WebPush;
    const webpush = mod.default ?? mod;
    webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")?.trim() || "mailto:help@studentfunction.com", publicKey, privateKey);
    return webpush;
  } catch (e) {
    errors.push(`web push setup: ${errorText(e)}`);
    return null;
  }
}

type Totals = { claimed: number; sent: number; retried: number; expo: number; web: number; removedTokens: number; batches: number };

async function run() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
  const supabase = createClient(url, key);

  const started = Date.now();
  const totals: Totals = { claimed: 0, sent: 0, retried: 0, expo: 0, web: 0, removedTokens: 0, batches: 0 };
  const errors: string[] = [];
  const toRetry: number[] = [];
  const web: { push: WebPush | null | undefined } = { push: undefined };

  while (Date.now() - started < RUN_BUDGET_MS) {
    // Take the next notifications to send, so no other run sends them too.
    // (Before the instant-push migration is run there's no claim function, so
    // it reads one batch the old way and stops.)
    const claimed = await supabase.rpc("claim_push_batch", { batch: CLAIM_SIZE });
    let rows: QueueRow[];
    let claiming = true;
    if (!claimed.error) rows = ((claimed.data ?? []) as QueueRow[]).sort((a, b) => a.id - b.id);
    else {
      const { data: queued, error: queueError } = await supabase.from("push_queue").select("id, user_id, kind, title, body, url").is("sent_at", null).order("created_at").limit(200);
      if (queueError) throw new Error(`reading push_queue: ${queueError.message}`);
      rows = (queued ?? []) as QueueRow[];
      claiming = false;
    }
    if (rows.length === 0) break;
    totals.batches += 1;
    totals.claimed += rows.length;
    const batchErrors: string[] = [];
    const { sent, retry } = await sendBatch(supabase, rows, totals, batchErrors, web);
    // (Without claiming there's no safe way to try again: everything read is marked, as before.)
    const done = claiming ? sent : [...sent, ...retry];
    await markSent(supabase, done, batchErrors);
    totals.sent += done.length;
    if (claiming) toRetry.push(...retry);
    errors.push(...batchErrors);
    if (!claiming) break;
  }

  // What couldn't be sent goes back in the queue for the next run, or is
  // given up on after MAX_ATTEMPTS tries.
  if (toRetry.length) {
    totals.retried = toRetry.length;
    await release(supabase, toRetry, errors);
  }
  const purged = await supabase.rpc("purge_push_queue");
  if (purged.error && !/purge_push_queue/.test(purged.error.message)) errors.push(`purging: ${purged.error.message}`);
  return { ...totals, purged: purged.error ? 0 : Number(purged.data ?? 0), errors: errors.slice(0, 5) };
}

// Sends one claim: the people's phones and browsers, Expo in parallel
// requests of up to 100, Web Push a few at a time.
async function sendBatch(supabase: SupabaseClient, rows: QueueRow[], totals: Totals, errors: string[], web: { push: WebPush | null | undefined }) {
  const users = [...new Set(rows.map((r) => r.user_id))];
  const tokenParts = await Promise.all(
    chunk(users, ID_CHUNK).map(async (ids) => {
      const { data, error } = await supabase.from("push_tokens").select("id, user_id, platform, token, subscription").in("user_id", ids);
      if (error) throw new Error(`reading push_tokens: ${error.message}`);
      return (data ?? []) as TokenRow[];
    }),
  );
  const plan = planDeliveries(rows, tokenParts.flat());
  totals.expo += plan.expo.length;
  totals.web += plan.web.length;

  const deliveries: Delivery[] = [];
  const dead = new Set<string>();
  const expoResults = await mapLimit(chunk(plan.expo, EXPO_BATCH), EXPO_PARALLEL, async (batch) => {
    try {
      // Sent again after a short wait if Expo says too many at once (429).
      const post = async () => {
        const res = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(batch.map((j) => j.message)),
        });
        return { status: res.status, answer: await res.json().catch(() => null) };
      };
      const { status, answer } = await sendExpoRequest(post, (ms) => new Promise((r) => setTimeout(r, ms)));
      return readExpoAnswer(batch, status, answer);
    } catch (e) {
      return readExpoAnswer(batch, 0, { errors: [{ message: errorText(e) }] });
    }
  });
  for (const r of expoResults) {
    deliveries.push(...r.deliveries);
    r.dead.forEach((t) => dead.add(t));
    errors.push(...r.errors);
  }

  if (plan.web.length) {
    if (web.push === undefined) web.push = await loadWebPush(errors);
    const webpush = web.push;
    const webResults = await mapLimit(plan.web, WEB_PARALLEL, async (job: WebJob) => {
      if (!webpush) return { job, outcome: "failed" as const, error: null };
      try {
        const payload = JSON.stringify({ title: job.row.title, body: job.row.body, url: job.row.url ? `${SITE}${job.row.url}` : SITE });
        await webpush.sendNotification(job.token.subscription, payload, { TTL: 3600 });
        return { job, outcome: webOutcome(null), error: null };
      } catch (e) {
        return { job, outcome: webOutcome(e), error: e };
      }
    });
    for (const r of webResults) {
      deliveries.push({ rowId: r.job.row.id, outcome: r.outcome });
      if (r.outcome === "dead") dead.add(r.job.token.token);
      else if (r.error) errors.push(`web: ${errorText(r.error)}`);
    }
  }

  if (dead.size) {
    for (const tokens of chunk([...dead], ID_CHUNK)) {
      const { error } = await supabase.from("push_tokens").delete().in("token", tokens);
      if (error) errors.push(`removing dead tokens: ${error.message}`);
    }
    totals.removedTokens += dead.size;
  }
  return settle(rows.map((r) => r.id), deliveries);
}

async function markSent(supabase: SupabaseClient, ids: number[], errors: string[]) {
  const sentAt = new Date().toISOString();
  const error = errors.length ? errors.slice(0, 3).join("; ") : null;
  for (const part of chunk(ids, ID_CHUNK)) {
    const { error: markError } = await supabase.from("push_queue").update({ sent_at: sentAt, error }).in("id", part);
    if (markError) throw new Error(`marking push_queue as sent: ${markError.message}`);
  }
}

async function release(supabase: SupabaseClient, ids: number[], errors: string[]) {
  const why = `gave up after ${MAX_ATTEMPTS} tries: ${errors.slice(0, 2).join("; ") || "sending failed"}`.slice(0, 500);
  for (const part of chunk(ids, ID_CHUNK)) {
    const again = await supabase.from("push_queue").update({ claimed_at: null }).in("id", part).lt("attempts", MAX_ATTEMPTS);
    if (again.error) errors.push(`returning to the queue: ${again.error.message}`);
    const givenUp = await supabase.from("push_queue").update({ sent_at: new Date().toISOString(), error: why }).in("id", part).gte("attempts", MAX_ATTEMPTS);
    if (givenUp.error) errors.push(`giving up: ${givenUp.error.message}`);
  }
}
