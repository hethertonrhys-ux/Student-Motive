"use server";

import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { OrgKind } from "@/lib/types";

export type FoundSociety = { id: string; name: string; slug: string; kind: OrgKind; logo_url: string | null; university: string };

// Search societies at every London uni (the database does the matching),
// with the searcher's own uni first.
export async function searchAllSocieties(query: string): Promise<FoundSociety[]> {
  const q = query.trim().slice(0, 100);
  if (!q) return [];
  const [supabase, me] = await Promise.all([createClient(), getProfile()]);
  const { data } = await supabase.rpc("search_societies", { q, first_uni: me?.university ?? null });
  return (data ?? []) as FoundSociety[];
}

// Count taps on "Search all London unis" (for the Function team).
export async function logSearchAllUnis(query: string) {
  const me = await getProfile();
  if (!me) return;
  const supabase = await createClient();
  await supabase.from("search_events").insert({ event: "societies_search_all_unis", university: me.university, query: query.trim().slice(0, 100) });
}
