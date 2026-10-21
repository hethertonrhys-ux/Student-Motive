import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { CHAT_MEDIA, CHAT_MEDIA_BUCKET, mediaProblem, shrinkTo, type MediaKind } from "@function/shared";
import { SUPABASE_KEY, SUPABASE_URL, supabase } from "@/lib/supabase";

// Photos and videos for chats: pick one (library or camera), make it small
// enough to send quickly, and upload it with progress.

export type PickedMedia = { kind: MediaKind; uri: string; width: number; height: number; durationMs: number | null; mimeType: string; ext: string };

const VIDEO_EXT: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };

// Pick or take one photo or video. Null if they cancel; throws (with words
// to show) when permission is refused or the file is too long or too big.
export async function pickChatMedia(source: "library" | "camera"): Promise<PickedMedia | null> {
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error("Function needs your camera to take photos and videos. You can allow it in your phone's Settings → Function → Camera.");
  } else if (Platform.OS === "android") {
    // iOS shows its own picker without needing photo-library access; Android needs the permission.
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error("Function needs access to your photos. You can allow it in your phone's settings.");
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images", "videos"],
    quality: 1,
    exif: false,
    videoMaxDuration: CHAT_MEDIA.maxVideoSeconds,
    // iPhone: videos are compressed to 540p while they're picked or recorded.
    videoExportPreset: ImagePicker.VideoExportPreset.H264_960x540,
    // iPhone: hand over photos as ordinary JPEGs. Newer iPhones take HDR
    // photos, and shrinking those as they were came out as rainbow noise.
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  };
  const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  if (asset.type === "video") {
    const mimeType = asset.mimeType ?? "video/mp4";
    // Phones give the length in milliseconds; the browser picker gives seconds.
    const durationMs = asset.duration == null || !Number.isFinite(asset.duration) ? null : Platform.OS === "web" ? asset.duration * 1000 : asset.duration;
    const problem = mediaProblem("video", { durationMs, bytes: asset.fileSize, mimeType });
    if (problem) throw new Error(problem);
    return { kind: "video", uri: asset.uri, width: asset.width, height: asset.height, durationMs, mimeType, ext: VIDEO_EXT[mimeType] ?? "mp4" };
  }
  // Photos: the longest side at most 1280px, as JPEG. Both sides are given
  // as whole numbers, so the shrunk picture's rows line up.
  const size = shrinkTo(asset.width, asset.height);
  const context = ImageManipulator.manipulate(asset.uri);
  if (size.width < asset.width) context.resize({ width: size.width, height: size.height });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: CHAT_MEDIA.photoQuality });
  image.release();
  return { kind: "photo", uri: saved.uri, width: saved.width, height: saved.height, durationMs: null, mimeType: "image/jpeg", ext: "jpg" };
}

export type Upload = { promise: Promise<void>; abort: () => void };

// Upload to chat-media/<path>, reporting progress (0 to 1).
export function uploadChatMedia(path: string, file: { uri: string; mimeType: string }, onProgress: (fraction: number) => void): Upload {
  const xhr = new XMLHttpRequest();
  const promise = (async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Log in again to send photos and videos.");
    const form = new FormData();
    form.append("cacheControl", "3600");
    const name = path.split("/").pop() ?? "file";
    if (Platform.OS === "web") {
      const blob = await (await fetch(file.uri)).blob();
      form.append("", new File([blob], name, { type: file.mimeType }));
    } else {
      form.append("", { uri: file.uri, name, type: file.mimeType } as unknown as Blob);
    }
    await new Promise<void>((resolve, reject) => {
      xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/${CHAT_MEDIA_BUCKET}/${path}`);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("apikey", SUPABASE_KEY);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        reject(new Error(xhr.status === 413 || /too large|exceeded/i.test(xhr.responseText) ? "That file is too big to send (the limit is 50 MB)." : "The upload didn't work. Check your connection and try again."));
      };
      xhr.onerror = () => reject(new Error("The upload didn't work. Check your connection and try again."));
      xhr.onabort = () => reject(new Error("Cancelled."));
      xhr.send(form);
    });
    onProgress(1);
  })();
  return { promise, abort: () => xhr.abort() };
}
