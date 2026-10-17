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

export type ProfileState = { error?: string; saved?: boolean };

export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const profile = await getProfile();
  if (!profile) return { error: "Log in first." };
  const clean = (key: string, max: number) => String(formData.get(key) ?? "").trim().replace(/[ \t]+/g, " ").slice(0, max);
  const name = clean("name", 60);
  const course = clean("course", 60) || null;
  const bio = clean("bio", 160).replace(/\n{3,}/g, "\n\n") || null;
  if (name.length < 2) return { error: "Enter your name." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ display_name: name, course, bio }).eq("id", profile.id);
  if (error) return { error: "Couldn't save. Please try again." };
  revalidatePath("/account");
  revalidatePath(`/u/${profile.id}`);
  return { saved: true };
}
