"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type NameState = { error?: string };

export async function saveName(path: string, _prev: NameState, formData: FormData): Promise<NameState> {
  const profile = await getProfile();
  if (!profile) return { error: "Log in first." };
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (name.length < 2) return { error: "Enter your name." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", profile.id);
  if (error) return { error: "Couldn't save your name. Please try again." };
  revalidatePath(path);
  return {};
}
