"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ClaimState = { error?: string };

export async function submitClaim(_prev: ClaimState, formData: FormData): Promise<ClaimState> {
  const profile = await requireProfile();
  const societyId = String(formData.get("society_id") ?? "");
  const committeeRole = String(formData.get("committee_role") ?? "").trim().slice(0, 100);
  const message = String(formData.get("message") ?? "").trim().slice(0, 1000);

  if (!societyId) return { error: "Choose your society." };
  if (!committeeRole) return { error: "Tell us your role on the committee." };

  const supabase = await createClient();
  const { error } = await supabase.from("society_claims").insert({
    society_id: societyId,
    user_id: profile.id,
    committee_role: committeeRole,
    message: message || null,
  });

  if (error) {
    if (error.code === "23505") return { error: "You've already asked to manage this society. We'll be in touch." };
    return { error: "Something went wrong. Please try again." };
  }

  redirect("/dashboard");
}
