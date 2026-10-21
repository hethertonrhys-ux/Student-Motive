// Sends queued emails (public.email_queue): today, a note to
// help@studentfunction.com for every new report, so the team can review it
// within 24 hours. Sent with Resend (the same service as the login emails).
//
// Deploy:  supabase functions deploy send-email --no-verify-jwt
// Secrets: supabase secrets set EMAIL_SECRET=... RESEND_API_KEY=... EMAIL_FROM="Function <reports@studentfunction.com>"
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
// EMAIL_FROM must be on a domain verified in Resend.)
// Called every minute by pg_cron (see supabase/RUN_ONCE_email_cron.sql) with
// the x-email-secret header. Each email is tried up to 5 times; the last
// error is kept on its row (email_queue.error).
import { createClient } from "npm:@supabase/supabase-js@2";

type Row = { id: number; to_address: string; subject: string; body: string; attempts: number };

const RESEND_URL = Deno.env.get("RESEND_API_URL")?.trim() || "https://api.resend.com/emails";

Deno.serve(async (req) => {
  if (!Deno.env.get("EMAIL_SECRET") || req.headers.get("x-email-secret") !== Deno.env.get("EMAIL_SECRET")) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    return Response.json(await run());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("send-email failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
});

async function run() {
  const key = Deno.env.get("RESEND_API_KEY")?.trim();
  const from = Deno.env.get("EMAIL_FROM")?.trim();
  if (!key || !from) throw new Error("RESEND_API_KEY and EMAIL_FROM must be set");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data, error } = await db.from("email_queue").select("id, to_address, subject, body, attempts").is("sent_at", null).lt("attempts", 5).order("id").limit(20);
  if (error) throw new Error(`reading the queue: ${error.message}`);
  let sent = 0;
  const failed: string[] = [];
  for (const row of (data ?? []) as Row[]) {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [row.to_address], subject: row.subject, text: row.body }),
    }).catch((e) => new Response(String(e), { status: 599 }));
    if (res.ok) {
      sent += 1;
      await db.from("email_queue").update({ sent_at: new Date().toISOString(), attempts: row.attempts + 1, error: null }).eq("id", row.id);
    } else {
      const text = (await res.text()).slice(0, 500);
      failed.push(`${row.id}: ${res.status} ${text}`);
      await db.from("email_queue").update({ attempts: row.attempts + 1, error: `${res.status} ${text}` }).eq("id", row.id);
    }
  }
  return { sent, failed };
}
