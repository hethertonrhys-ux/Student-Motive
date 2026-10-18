"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { MAX_ANSWER, MAX_PROMPTS, promptById } from "@/lib/prompts";
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
  if (name.length < 2) return { error: "Enter your name." };
  // "About me" has been replaced by prompts; the old text is kept, so it's
  // only changed if the form still has the box.
  const bio = formData.has("bio") ? { bio: clean("bio", 160).replace(/\n{3,}/g, "\n\n") || null } : {};
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ display_name: name, course, ...bio }).eq("id", profile.id);
  if (error) return { error: "Couldn't save. Please try again." };
  revalidatePath("/account");
  revalidatePath(`/u/${profile.id}`);
  return { saved: true };
}

// ---------- Prompts ----------

// Save your prompt answers (up to 3), replacing the ones you had.
export async function saveProfilePrompts(answers: { prompt_id: string; answer: string }[]): Promise<{ error?: string }> {
  const profile = await getProfile();
  if (!profile) return { error: "Log in first." };
  const clean = answers
    .filter((a) => promptById(a.prompt_id))
    .map((a) => ({ prompt_id: a.prompt_id, answer: String(a.answer).trim().replace(/\s+/g, " ").slice(0, MAX_ANSWER) }))
    .filter((a) => a.answer);
  if (clean.length > MAX_PROMPTS) return { error: `You can answer up to ${MAX_PROMPTS} prompts.` };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_profile_prompts", { answers: clean });
  if (error) return { error: "Couldn't save. Please try again." };
  revalidatePath("/account");
  revalidatePath(`/u/${profile.id}`);
  return {};
}

// ---------- Profile photo ----------

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// The profile picture: the cropped circle everyone sees, plus (for new
// photos) the whole photo it was cropped from, so it can be re-cropped later
// without uploading again. Re-cropping sends only the new circle.
export async function uploadProfilePhoto(formData: FormData): Promise<{ error?: string; url?: string }> {
  const profile = await getProfile();
  if (!profile) return { error: "Log in first." };
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo." };
  const ext = PHOTO_TYPES[file.type];
  if (!ext) return { error: "Photos must be JPG, PNG or WebP." };
  if (file.size > 2 * 1024 * 1024) return { error: "That photo is too big. Try a smaller one." };
  const original = formData.get("original");
  const newOriginal = original instanceof File && original.size > 0 && original.type === "image/jpeg" && original.size <= 3 * 1024 * 1024;

  const supabase = await createClient();
  const path = `${profile.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type });
  if (error) {
    console.error("Profile photo upload failed:", error.message);
    // Supabase's reason (e.g. "Bucket not found") helps us fix setup problems.
    return { error: `The photo couldn't be uploaded (${error.message}). Please try again.` };
  }
  let originalPath = newOriginal ? `${profile.id}/${ORIGINAL}${crypto.randomUUID()}.jpg` : await findOriginal(supabase, profile.id);
  if (newOriginal && originalPath) {
    const { error: originalError } = await supabase.storage.from("avatars").upload(originalPath, original as File, { contentType: "image/jpeg" });
    if (originalError) originalPath = null; // the circle is saved; it just can't be re-cropped later
  }
  const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;

  await supabase.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
  await removeOldPhotos(supabase, profile.id, [path, originalPath]);
  revalidatePath("/", "layout");
  return { url };
}

// The whole photo the profile picture was cropped from, if we have it
// (pictures added before re-cropping existed only have the circle).
export async function getProfilePhotoOriginal(): Promise<string | null> {
  const profile = await getProfile();
  if (!profile) return null;
  const supabase = await createClient();
  const path = await findOriginal(supabase, profile.id);
  return path ? supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl : null;
}

export async function removeProfilePhoto(): Promise<{ error?: string }> {
  const profile = await getProfile();
  if (!profile) return { error: "Log in first." };
  const supabase = await createClient();
  await supabase.from("profiles").update({ avatar_url: null }).eq("id", profile.id);
  await removeOldPhotos(supabase, profile.id, []);
  revalidatePath("/", "layout");
  return {};
}

const ORIGINAL = "original-";

async function findOriginal(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.storage.from("avatars").list(userId, { limit: 100 });
  const name = (data ?? []).find((f) => f.name.startsWith(ORIGINAL))?.name;
  return name ? `${userId}/${name}` : null;
}

// Delete earlier photos so only the current one (and its original) is kept.
async function removeOldPhotos(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, keep: (string | null)[]) {
  const { data } = await supabase.storage.from("avatars").list(userId, { limit: 100 });
  const old = (data ?? []).map((f) => `${userId}/${f.name}`).filter((p) => !keep.includes(p));
  if (old.length) await supabase.storage.from("avatars").remove(old);
}
