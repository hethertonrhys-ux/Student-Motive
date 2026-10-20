import type { SupabaseClient } from "@supabase/supabase-js";

// The SU paperwork drafts Function prepares for an event (risk assessment,
// budget), from the server function supabase/functions/event-documents.
// The committee checks them and submits them to their SU.
//
// Not used by the app yet: the server function returns "Templates not
// added yet" until LSESU's templates are in docs/lsesu-templates/. Kept
// here for when they are.

export type EventDocumentKind = "risk_assessment" | "budget";

export const EVENT_DOCUMENT_KINDS: EventDocumentKind[] = ["risk_assessment", "budget"];

export const TEMPLATES_NOT_ADDED = "Templates not added yet";

// Asks the server to prepare a draft. Returns a short-lived link to the
// file, or an error to show.
export async function requestEventDocument(supabase: SupabaseClient, eventId: string, kind: EventDocumentKind): Promise<{ url?: string; error?: string }> {
  if (!eventId || !EVENT_DOCUMENT_KINDS.includes(kind)) return { error: "That document isn't available." };
  let result: Awaited<ReturnType<SupabaseClient["functions"]["invoke"]>>;
  try {
    result = await supabase.functions.invoke("event-documents", { body: { eventId, kind } });
  } catch {
    return { error: "Couldn't prepare the document. Please try again." };
  }
  const { data, error, response } = result;
  if (!error) {
    const url = (data as { url?: unknown } | null)?.url;
    return typeof url === "string" && url ? { url } : { error: "Couldn't prepare the document. Please try again." };
  }
  const status = (error as { context?: { status?: number } }).context?.status ?? response?.status;
  if (status === 501) return { error: TEMPLATES_NOT_ADDED };
  if (status === 401) return { error: "Log in first." };
  if (status === 403) return { error: "Only the society's committee can do this." };
  if (status === 404) {
    // "Event not found", or "Add the event admin answers first" (trying
    // again can't help either way).
    let text = "";
    try {
      text = String(((await (error as { context?: Response }).context?.json()) as { error?: unknown } | null)?.error ?? "");
    } catch {
      // Not JSON: treat it as the answers being missing.
    }
    return { error: text === "Event not found" ? "That event couldn't be found." : "Add the event admin answers first." };
  }
  return { error: "Couldn't prepare the document. Please try again." };
}
