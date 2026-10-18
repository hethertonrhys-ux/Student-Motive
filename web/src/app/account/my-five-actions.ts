"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { PHOTO_BUCKET } from "@/lib/profile-photos";
import { createClient } from "@/lib/supabase/server";

export type Result = { error?: string };

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const friendly = (m?: string) => m?.replace(/^.*?ERROR:\s*/, "") || "Something went wrong. Please try again.";

function refresh(userId: string) {
  revalidatePath("/account");
  revalidatePath("/account/archive");
  revalidatePath(`/u/${userId}`);
}

// Upload a photo (already compressed in the browser) and add it to your 5.
export async function uploadMyFivePhoto(formData: FormData): Promise<Result> {
  const me = await getProfile();
  if (!me) return { error: "Log in first." };
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo." };
  const ext = TYPES[file.type];
  if (!ext) return { error: "Photos must be JPG, PNG or HEIC." };
  if (file.size > 3 * 1024 * 1024) return { error: "That photo is too big. Try a smaller one." };

  const supabase = await createClient();
  // Check for a free space before uploading, so we don't store files we can't use.
  const { data: count } = await supabase.rpc("current_photo_count", { person: me.id });
  if (Number(count) >= 5) return { error: "All 5 spaces are full. Remove or archive a photo first." };

  const path = `${me.id}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type });
  if (uploadError) return { error: `The photo couldn't be uploaded (${uploadError.message}). Please try again.` };
  const { error } = await supabase.rpc("add_profile_photo", { photo_path: path });
  if (error) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    return { error: friendly(error.message) };
  }
  refresh(me.id);
  return {};
}

export async function pinPhoto(id: string, pin: boolean): Promise<Result> {
  const me = await getProfile();
  if (!me) return { error: "Log in first." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pin_profile_photo", { pid: id, pin });
  refresh(me.id);
  return error ? { error: friendly(error.message) } : {};
}

export async function archivePhoto(id: string): Promise<Result> {
  const me = await getProfile();
  if (!me) return { error: "Log in first." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_profile_photo", { pid: id });
  refresh(me.id);
  return error ? { error: friendly(error.message) } : {};
}

export async function restorePhoto(id: string): Promise<Result> {
  const me = await getProfile();
  if (!me) return { error: "Log in first." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_profile_photo", { pid: id });
  refresh(me.id);
  return error ? { error: friendly(error.message) } : {};
}

// Delete for good: the database row and the file.
export async function deletePhoto(id: string): Promise<Result> {
  const me = await getProfile();
  if (!me) return { error: "Log in first." };
  const supabase = await createClient();
  const { data } = await supabase.from("profile_photos").delete().eq("id", id).eq("user_id", me.id).select("path");
  if (data?.[0]) await supabase.storage.from(PHOTO_BUCKET).remove([data[0].path]);
  refresh(me.id);
  return {};
}

export async function setShowSocieties(show: boolean): Promise<Result> {
  const me = await getProfile();
  if (!me) return { error: "Log in first." };
  const supabase = await createClient();
  const { error } = await supabase.from("profile_settings").upsert({ user_id: me.id, show_societies: show });
  refresh(me.id);
  return error ? { error: "Couldn't save. Please try again." } : {};
}

export async function reportPhoto(id: string, reason: string): Promise<Result> {
  const me = await getProfile();
  if (!me) return { error: "Log in first." };
  const clean = reason.trim().slice(0, 200);
  if (!clean) return { error: "Say why you're reporting it." };
  const supabase = await createClient();
  const { error } = await supabase.from("profile_photo_reports").insert({ photo_id: id, reason: clean });
  return error ? { error: "Couldn't send the report. Please try again." } : {};
}

// Re-crop a photo that's already in your 5: the cropped version replaces the
// file (same place in the order). "backup" is the old photo, put back if the
// new one can't be saved.
export async function recropMyFivePhoto(id: string, formData: FormData): Promise<Result> {
  const me = await getProfile();
  if (!me) return { error: "Log in first." };
  const file = formData.get("photo");
  const backup = formData.get("backup");
  if (!(file instanceof File) || file.type !== "image/jpeg" || file.size === 0 || file.size > 3 * 1024 * 1024) {
    return { error: "That crop couldn't be saved. Please try again." };
  }
  const supabase = await createClient();
  const { data: photo } = await supabase.from("profile_photos").select("path").eq("id", id).eq("user_id", me.id).maybeSingle();
  if (!photo) return { error: "Photo not found." };
  const bucket = supabase.storage.from(PHOTO_BUCKET);
  await bucket.remove([photo.path]);
  const { error } = await bucket.upload(photo.path, file, { contentType: "image/jpeg" });
  if (error) {
    if (backup instanceof File && backup.size > 0) await bucket.upload(photo.path, backup, { contentType: backup.type || "image/jpeg" });
    return { error: "That crop couldn't be saved. Please try again." };
  }
  refresh(me.id);
  return {};
}
