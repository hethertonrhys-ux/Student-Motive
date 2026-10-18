import type { SupabaseClient } from "@supabase/supabase-js";

// How many profile prompts someone has answered (for the "Complete your profile" nudge).
export async function promptCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count } = await supabase.from("profile_prompts").select("prompt_id", { count: "exact", head: true }).eq("user_id", userId);
  return count ?? 0;
}
