import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

// The logged-in user's id, or null if logged out. The login is checked on our
// own server using Supabase's public signing key, so it needs no trip to
// Supabase, and it's checked once per page however many parts ask.
export const getUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub ?? null;
});

// The logged-in user's profile, or null if logged out. Loaded once per page.
export const getProfile = cache(async (): Promise<Profile | null> => {
  const id = await getUserId();
  if (!id) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, display_name, is_admin")
    .eq("id", id)
    .single();
  return data;
});

export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (!profile.is_admin) redirect("/dashboard");
  return profile;
}
