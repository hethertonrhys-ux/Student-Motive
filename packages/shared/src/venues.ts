import type { SupabaseClient } from "@supabase/supabase-js";
import type { Venue } from "./types";

export async function getVenues(supabase: SupabaseClient): Promise<Venue[]> {
  const { data } = await supabase.from("venues").select("*").order("name");
  return (data ?? []) as Venue[];
}
