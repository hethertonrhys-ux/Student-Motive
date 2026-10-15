import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { Society } from "@/lib/types";

// Loads a society the logged-in user is allowed to manage, or shows 404.
export async function requireManagedSociety(societyId: string) {
  await requireProfile();
  const supabase = await createClient();

  const [{ data: society }, { data: allowed }] = await Promise.all([
    supabase.from("societies").select("*").eq("id", societyId).maybeSingle<Society>(),
    supabase.rpc("is_society_admin", { sid: societyId }),
  ]);

  if (!society || allowed !== true) notFound();
  return { supabase, society };
}
