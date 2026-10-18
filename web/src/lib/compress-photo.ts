// Runs in the browser: turns a chosen photo into a small JPEG before upload.
// iPhone HEIC photos are converted first if the browser can't read them.

const MAX_SIDE = 1440;
export const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;

const isHeic = (file: File) => /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (error) {
    if (!isHeic(file)) throw error;
    // Only downloaded when someone actually picks a HEIC photo on a browser that can't read it.
    const heic2any = (await import("heic2any")).default;
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    return createImageBitmap(Array.isArray(converted) ? converted[0] : converted);
  }
}

// A chosen photo, ready to show or crop (e.g. in PhotoCropper).
export async function decodePhoto(file: File): Promise<ImageBitmap> {
  if (file.size > MAX_ORIGINAL_BYTES) throw new Error("too-big");
  if (!file.type.startsWith("image/") && !isHeic(file)) throw new Error("not-image");
  return decode(file);
}

export async function compressPhoto(file: File): Promise<File> {
  const bitmap = await decodePhoto(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.82),
  );
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}
