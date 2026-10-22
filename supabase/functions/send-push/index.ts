// Sends queued push notifications: Expo's push service for the iPhone and
// Android apps, Web Push (VAPID) for the home-screen web app.
//
// Deploy:  supabase functions deploy send-push --no-verify-jwt
// Secrets: supabase secrets set PUSH_SECRET=... VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:help@studentfunction.com
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)
// Called straight away when notifications are queued (the push_queue_kick
// trigger, set up by RUN_ONCE_instant_push.sql), and every minute by pg_cron
// as the backup (RUN_ONCE_push_cron.sql), with the x-push-secret header.
// Each run claims its batch (claim_push_batch), so two runs at once never
// send the same notification twice.
//
// Any failure is returned as JSON ({ "error": "..." }) so it can be read from
// net._http_response.content or the function's Logs tab.
import { createClient } from "npm:@supabase/supabase-js@2";

type QueueRow = { id: number; user_id: string; kind: string; title: string; body: string; url: string | null };
type TokenRow = { id: string; user_id: string; platform: "ios" | "android" | "web"; token: string; subscription: unknown };
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

async function run() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
  const supabase = createClient(url, key);

  // Take the next notifications to send, so no other run sends them too.
  // (Before the instant-push migration is run there's no claim function, so
  // it reads the queue the old way.)
  let rows: QueueRow[];
  const claimed = await supabase.rpc("claim_push_batch", { batch: 200 });
  if (!claimed.error) rows = ((claimed.data ?? []) as QueueRow[]).sort((a, b) => a.id - b.id);
  else {
    const { data: queued, error: queueError } = await supabase.from("push_queue").select("id, user_id, kind, title, body, url").is("sent_at", null).order("created_at").limit(200);
    if (queueError) throw new Error(`reading push_queue: ${queueError.message}`);
    rows = (queued ?? []) as QueueRow[];
  }
  if (rows.length === 0) return { sent: 0 };

  const { data: tokenRows, error: tokenError } = await supabase
    .from("push_tokens")
    .select("id, user_id, platform, token, subscription")
    .in("user_id", [...new Set(rows.map((r) => r.user_id))]);
  if (tokenError) throw new Error(`reading push_tokens: ${tokenError.message}`);
  const tokens = (tokenRows ?? []) as TokenRow[];
  const byUser = new Map<string, TokenRow[]>();
  for (const t of tokens) byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t]);

  // priority "high": delivered straight away rather than when the phone next wakes up.
  const expoMessages: { to: string; title: string; body: string; data: { url: string | null }; sound: "default"; channelId: string; priority: "high" }[] = [];
  const webJobs: { row: QueueRow; token: TokenRow }[] = [];
  for (const row of rows) {
    for (const t of byUser.get(row.user_id) ?? []) {
      if (t.platform === "web") webJobs.push({ row, token: t });
      else expoMessages.push({ to: t.token, title: row.title, body: row.body, data: { url: row.url }, sound: "default", channelId: "default", priority: "high" });
    }
  }

  const dead = new Set<string>();
  const errors: string[] = [];
  // Expo: up to 100 per request.
  for (let i = 0; i < expoMessages.length; i += 100) {
    const batch = expoMessages.slice(i, i + 100);
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch),
      });
      const out = (await res.json()) as { data?: { status: string; details?: { error?: string } }[]; errors?: { code?: string; message?: string }[] };
      if (!res.ok || out.errors?.length) errors.push(`expo ${res.status}: ${(out.errors ?? []).map((e) => e.message ?? e.code).join("; ") || "request failed"}`);
      out.data?.forEach((ticket, j) => {
        if (ticket.status === "error") {
          errors.push(ticket.details?.error ?? "expo error");
          if (ticket.details?.error === "DeviceNotRegistered") dead.add(batch[j].to);
        }
      });
    } catch (e) {
      errors.push(`expo: ${errorText(e)}`);
    }
  }
  // Web Push, one at a time.
  if (webJobs.length) {
    const webpush = await loadWebPush(errors);
    if (webpush) {
      for (const job of webJobs) {
        try {
          const payload = JSON.stringify({ title: job.row.title, body: job.row.body, url: job.row.url ? `${SITE}${job.row.url}` : SITE });
          await webpush.sendNotification(job.token.subscription, payload, { TTL: 3600 });
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) dead.add(job.token.token);
          else errors.push(`web: ${errorText(e)}`);
        }
      }
    }
  }

  if (dead.size) {
    const { error } = await supabase.from("push_tokens").delete().in("token", [...dead]);
    if (error) errors.push(`removing dead tokens: ${error.message}`);
  }
  const { error: markError } = await supabase
    .from("push_queue")
    .update({ sent_at: new Date().toISOString(), error: errors.length ? errors.slice(0, 3).join("; ") : null })
    .in("id", rows.map((r) => r.id));
  if (markError) throw new Error(`marking push_queue as sent: ${markError.message}`);
  return { sent: rows.length, expo: expoMessages.length, web: webJobs.length, removedTokens: dead.size, errors: errors.slice(0, 5) };
}

