import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uniById, uniFromEmail } from "@/lib/universities";

// A new account whose email isn't a uni email (someone invited from the
// Admin page) takes the uni of the landing page they arrived on, if any.
// Uni emails always get their own uni, set by the database.
export async function applyArrivalUni(supabase: SupabaseClient, userId: string, email: string | undefined, arrival: string | undefined) {
  const uni = uniById(arrival);
  if (!uni || uniFromEmail(email)) return;
  await supabase.from("profiles").update({ university: uni.id }).eq("id", userId);
}
