// Prepares the SU paperwork drafts for a society's event: the risk
// assessment and the budget, filled in from the committee's event admin
// answers. Function prepares drafts; the committee checks them and submits
// them to their SU.
//
// STATUS: LSESU's templates aren't in the repo yet, so after checking who's
// asking this returns 501 { "error": "Templates not added yet" }. See the
// TODO(lsesu-templates) block below. The app doesn't call it yet (it shows
// "Risk assessment and budget: coming soon"); packages/shared has
// requestEventDocument() ready for when it does.
//
// Deploy:  npx supabase functions deploy event-documents
// Secrets: none to set. SUPABASE_URL, SUPABASE_ANON_KEY and
//          SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
//          The service role key is only for writing the finished file to
//          the private 'society-documents' bucket (see
//          supabase/migrations/20261122000000_event_admin_documents.sql);
//          everything else runs as the person asking.
//
// Request:  POST { "eventId": "<uuid>", "kind": "risk_assessment" | "budget" }
//           with the caller's own "Authorization: Bearer <access token>".
// Answers:  400 bad input · 401 not logged in · 403 not the society's
//           committee · 404 no such event, or no event admin answers yet ·
//           501 templates not added yet. Once the templates are added:
//           200 { "url": "<signed link, valid 60 minutes>", "path": "..." }.
import { createClient } from "npm:@supabase/supabase-js@2";

type Kind = "risk_assessment" | "budget";

const KINDS: Kind[] = ["risk_assessment", "budget"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: CORS });
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "Use POST" });
  try {
    return await handle(req);
  } catch (e) {
    console.error("event-documents failed:", errorText(e));
    return reply(500, { error: "Something went wrong. Please try again." });
  }
});

async function handle(req: Request): Promise<Response> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim();
  if (!token) return reply(401, { error: "Log in first" });

  let input: { eventId?: unknown; kind?: unknown };
  try {
    input = await req.json();
  } catch {
    return reply(400, { error: "Send JSON: { eventId, kind }" });
  }
  const eventId = typeof input?.eventId === "string" ? input.eventId.trim() : "";
  const kind = input?.kind as Kind;
  if (!UUID.test(eventId)) return reply(400, { error: "eventId must be an event's id" });
  if (!KINDS.includes(kind)) return reply(400, { error: "kind must be risk_assessment or budget" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY are not set");

  // Everything below runs as the person asking, so the database's own rules
  // decide what they can see.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: user, error: userError } = await asCaller.auth.getUser(token);
  if (userError || !user?.user) return reply(401, { error: "Log in first" });

  const { data: event, error: eventError } = await asCaller.from("events").select("id, society_id, title, starts_at, ends_at, cost_pence").eq("id", eventId).maybeSingle();
  if (eventError) throw new Error(`reading the event: ${eventError.message}`);
  if (!event) return reply(404, { error: "Event not found" });
  const societyId = event.society_id as string | null;
  if (!societyId) return reply(403, { error: "Only the society's committee can do this" });

  const { data: allowed, error: allowedError } = await asCaller.rpc("is_society_admin", { sid: societyId });
  if (allowedError) throw new Error(`checking the committee: ${allowedError.message}`);
  if (allowed !== true) return reply(403, { error: "Only the society's committee can do this" });

  const { data: admin, error: adminError } = await asCaller.from("event_admin").select("*").eq("event_id", eventId).maybeSingle();
  if (adminError) throw new Error(`reading the event admin answers: ${adminError.message}`);
  if (!admin) return reply(404, { error: "Add the event admin answers first" });

  // TODO(lsesu-templates): fill in LSESU's own forms once they're added.
  // Do NOT make up our own versions of the SU's forms. When
  // docs/lsesu-templates/ has "Risk Assessment Template (Events).docx" and
  // "Budget Template (Events).xlsx":
  //   1. Read the template for this kind (bundle it with the function, e.g.
  //      copy it into supabase/functions/event-documents/templates/).
  //   2. Fill it in from the answers (the same rules as the app's preview,
  //      packages/shared/src/event-admin):
  //        - risk_assessment: the event's details, and one row per hazard
  //          from hazardsFor(answers) (title, who's at risk, the control
  //          measures and the rating);
  //        - budget: one row per cost line (admin.cost_lines: label, pence)
  //          and the total (budgetTotal: the larger of admin.budget_pence and
  //          the lines added up).
  //   3. Upload it with the service role (SUPABASE_SERVICE_ROLE_KEY) to the
  //      private 'society-documents' bucket at
  //      `${societyId}/${eventId}/${kind}.${kind === "budget" ? "xlsx" : "docx"}`
  //      (upsert: true, the right content type).
  //   4. Return a signed link valid for 60 minutes:
  //        createSignedUrl(path, 60 * 60) -> reply(200, { url, path }).
  // Until then, say so (after the checks above, so nobody else learns
  // anything about the event).
  return reply(501, { error: "Templates not added yet" });
}
