"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type JoinState = { error?: string };

export async function requestToJoin(societyId: string, slug: string, _prev: JoinState, formData: FormData): Promise<JoinState> {
  if (!(await getProfile())) redirect(`/login?next=/s/${slug}`);
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Enter the name you'd like members to see." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_membership", { sid: societyId, your_name: name });
  if (error) return { error: error.message.startsWith("This society is for") ? `${error.message}.` : "Couldn't send your request. Please try again." };
  revalidatePath(`/s/${slug}`);
  return {};
}

export async function leaveSociety(societyId: string, slug: string) {
  const profile = await getProfile();
  if (!profile) return;
  const supabase = await createClient();
  await supabase.from("society_members").delete().eq("society_id", societyId).eq("user_id", profile.id);
  revalidatePath(`/s/${slug}`);
}
