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

// ---------- Profile photo ----------

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function uploadProfilePhoto(formData: FormData): Promise<{ error?: string; url?: string }> {
  const profile = await getProfile();
  if (!profile) return { error: "Log in first." };
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo." };
  const ext = PHOTO_TYPES[file.type];
  if (!ext) return { error: "Photos must be JPG, PNG or WebP." };
  if (file.size > 2 * 1024 * 1024) return { error: "That photo is too big. Try a smaller one." };

  const supabase = await createClient();
  const path = `${profile.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type });
  if (error) return { error: "The photo couldn't be uploaded. Please try again." };
  const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;

  await supabase.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
  await removeOldPhotos(supabase, profile.id, path);
  revalidatePath("/", "layout");
  return { url };
}

export async function removeProfilePhoto(): Promise<{ error?: string }> {
  const profile = await getProfile();
  if (!profile) return { error: "Log in first." };
  const supabase = await createClient();
  await supabase.from("profiles").update({ avatar_url: null }).eq("id", profile.id);
  await removeOldPhotos(supabase, profile.id, null);
  revalidatePath("/", "layout");
  return {};
}

// Delete earlier photos so only the current one is kept.
async function removeOldPhotos(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, keep: string | null) {
  const { data } = await supabase.storage.from("avatars").list(userId, { limit: 100 });
  const old = (data ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== keep);
  if (old.length) await supabase.storage.from("avatars").remove(old);
}
