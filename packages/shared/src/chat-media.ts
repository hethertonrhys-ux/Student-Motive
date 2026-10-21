import type { SupabaseClient } from "@supabase/supabase-js";

// Photos and videos in chats: the limits, the checks before uploading, and
// the links to show them. The files live in the private chat-media bucket at
// <chat id>/<sender id>/<random name>; only people who can use the chat can
// open them (each link lasts an hour).

export const CHAT_MEDIA_BUCKET = "chat-media";
export const CHAT_MEDIA = {
  // The bucket refuses anything bigger.
  maxBytes: 50 * 1024 * 1024,
  // Videos: recording stops here, and longer ones from the library are refused.
  maxVideoSeconds: 60,
  // Photos are shrunk so their longest side is at most this, as JPEG.
  maxPhotoSide: 1280,
  photoQuality: 0.6,
};

export type MediaKind = "photo" | "video";

// "0:15", "1:00".
export function formatDuration(ms: number | null | undefined): string {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// What's wrong with a picked file before uploading it, in words, or null if it's fine.
export function mediaProblem(kind: MediaKind, file: { bytes?: number | null; durationMs?: number | null; mimeType?: string | null }): string | null {
  if (kind === "video" && (file.durationMs ?? 0) > CHAT_MEDIA.maxVideoSeconds * 1000 + 500) {
    return `That video is ${formatDuration(file.durationMs)} long. Videos can be up to ${CHAT_MEDIA.maxVideoSeconds} seconds.`;
  }
  if ((file.bytes ?? 0) > CHAT_MEDIA.maxBytes) {
    return kind === "video" ? "That video is too big to send (the limit is 50 MB). Try a shorter one." : "That photo is too big to send (the limit is 50 MB).";
  }
  if (file.mimeType && !/^(image\/(jpeg|png|webp|heic)|video\/(mp4|quicktime|webm))$/.test(file.mimeType)) {
    return kind === "video" ? "That kind of video can't be sent. Try an MP4 or a video from your camera." : "That kind of picture can't be sent. Try a JPEG or PNG.";
  }
  return null;
}

// The size to shrink a photo to: the longest side at most maxPhotoSide.
export function shrinkTo(width: number, height: number, maxSide = CHAT_MEDIA.maxPhotoSide): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Where a new file goes: <chat>/<me>/<random>.<ext>.
export function chatMediaPath(threadId: string, myId: string, ext: string): string {
  const random = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-z0-9-]/gi, "");
  return `${threadId}/${myId}/${random}.${ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin"}`;
}

// Short-lived links to the files, for everyone who can use the chat.
export async function chatMediaUrls(supabase: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data } = await supabase.storage.from(CHAT_MEDIA_BUCKET).createSignedUrls(unique, 3600);
  const out = new Map<string, string>();
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  return out;
}

// Post an uploaded photo or video into the chat.
export async function sendMedia(supabase: SupabaseClient, threadId: string, kind: MediaKind, path: string, size: { width?: number | null; height?: number | null; durationMs?: number | null }): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("send_media", {
    tid: threadId,
    media_kind: kind,
    path,
    width: Math.round(size.width ?? 0),
    height: Math.round(size.height ?? 0),
    duration_ms: Math.round(size.durationMs ?? 0),
  });
  if (!error) return {};
  return { error: /send messages here/.test(error.message) ? "You can't send messages in this chat." : /didn't finish/.test(error.message) ? "The upload didn't finish. Try again." : "Couldn't send. Try again." };
}
