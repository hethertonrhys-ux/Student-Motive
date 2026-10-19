// Sends queued push notifications: Expo's push service for the iPhone and
// Android apps, Web Push (VAPID) for the home-screen web app.
//
// Deploy:  supabase functions deploy send-push --no-verify-jwt
// Secrets: supabase secrets set PUSH_SECRET=... VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:help@studentfunction.com
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)
// Called every minute by pg_cron (see supabase/RUN_ONCE_push_cron.sql), or
// by a Database Webhook on push_queue inserts, with the x-push-secret header.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

type QueueRow = { id: number; user_id: string; kind: string; title: string; body: string; url: string | null };
type TokenRow = { id: string; user_id: string; platform: "ios" | "android" | "web"; token: string; subscription: unknown };

const SITE = Deno.env.get("SITE_URL") ?? "https://studentfunction.com";

Deno.serve(async (req) => {
  if (req.headers.get("x-push-secret") !== Deno.env.get("PUSH_SECRET")) {
    return new Response("Forbidden", { status: 403 });
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY"), vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  if (vapidPublic && vapidPrivate) webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:help@studentfunction.com", vapidPublic, vapidPrivate);

  const { data: queued } = await supabase.from("push_queue").select("id, user_id, kind, title, body, url").is("sent_at", null).order("created_at").limit(200);
  const rows = (queued ?? []) as QueueRow[];
  if (rows.length === 0) return Response.json({ sent: 0 });

  const { data: tokenRows } = await supabase.from("push_tokens").select("id, user_id, platform, token, subscription").in("user_id", [...new Set(rows.map((r) => r.user_id))]);
  const tokens = (tokenRows ?? []) as TokenRow[];
  const byUser = new Map<string, TokenRow[]>();
  for (const t of tokens) byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t]);

  const expoMessages: { to: string; title: string; body: string; data: { url: string | null }; sound: "default"; channelId: string }[] = [];
  const webJobs: { row: QueueRow; token: TokenRow }[] = [];
  for (const row of rows) {
    for (const t of byUser.get(row.user_id) ?? []) {
      if (t.platform === "web") webJobs.push({ row, token: t });
      else expoMessages.push({ to: t.token, title: row.title, body: row.body, data: { url: row.url }, sound: "default", channelId: "default" });
    }
  }

  const dead = new Set<string>();
  const errors: string[] = [];
  // Expo: up to 100 per request.
  for (let i = 0; i < expoMessages.length; i += 100) {
    const batch = expoMessages.slice(i, i + 100);
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(batch) });
      const out = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      out.data?.forEach((ticket, j) => {
        if (ticket.status === "error") {
          errors.push(ticket.details?.error ?? "expo error");
          if (ticket.details?.error === "DeviceNotRegistered") dead.add(batch[j].to);
        }
      });
    } catch (e) {
      errors.push(`expo: ${String(e)}`);
    }
  }
  // Web Push, one at a time.
  for (const job of webJobs) {
    if (!vapidPublic || !vapidPrivate) {
      errors.push("web push not configured (VAPID keys missing)");
      break;
    }
    try {
      await webpush.sendNotification(job.token.subscription as webpush.PushSubscription, JSON.stringify({ title: job.row.title, body: job.row.body, url: job.row.url ? `${SITE}${job.row.url}` : SITE }), { TTL: 3600 });
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) dead.add(job.token.token);
      else errors.push(`web: ${String(e)}`);
    }
  }

  if (dead.size) await supabase.from("push_tokens").delete().in("token", [...dead]);
  await supabase.from("push_queue").update({ sent_at: new Date().toISOString(), error: errors.length ? errors.slice(0, 3).join("; ") : null }).in("id", rows.map((r) => r.id));
  return Response.json({ sent: rows.length, expo: expoMessages.length, web: webJobs.length, removedTokens: dead.size, errors: errors.slice(0, 5) });
});
