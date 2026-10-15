import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Uploads an image to images/<societyId>/... and returns its public URL.
// Returns { url: null } if no file was chosen.
export async function uploadSocietyImage(
  supabase: SupabaseClient,
  societyId: string,
  file: FormDataEntryValue | null,
): Promise<{ url: string | null; error?: string }> {
  if (!(file instanceof File) || file.size === 0) return { url: null };
  const ext = TYPES[file.type];
  if (!ext) return { url: null, error: "Images must be JPG, PNG or WebP." };
  if (file.size > MAX_BYTES) return { url: null, error: "Images must be under 5MB." };

  const path = `${societyId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("images").upload(path, file, { contentType: file.type });
  if (error) return { url: null, error: "The image couldn't be uploaded. Please try again." };

  return { url: supabase.storage.from("images").getPublicUrl(path).data.publicUrl };
}
