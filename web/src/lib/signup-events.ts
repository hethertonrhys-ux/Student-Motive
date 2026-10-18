import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Sign-up funnel counts (reached the prompts step, skipped, completed,
// finished sign-up), so before/after can be compared. Stored in our own
// database, nothing sent anywhere else. Never blocks anything: if saving
// fails (e.g. before the table exists) it's simply skipped.
export type SignupEvent = "signup_finished" | "prompts_step_reached" | "prompts_skipped" | "prompts_completed";

export async function logSignupEvent(supabase: SupabaseClient, event: SignupEvent) {
  try {
    await supabase.from("signup_events").insert({ event });
  } catch {}
}
