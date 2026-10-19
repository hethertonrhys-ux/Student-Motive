import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import type { Picked, PickOptions } from "./pick-photos";

export const CAN_RECROP = false;

const MAX_SIDE = 1440;

function fromBase64(b64: string): ArrayBuffer {
  const bin = globalThis.atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// Crop an image to the aspect (centred), shrink it, and get JPEG bytes.
async function prepare(uri: string, width: number, height: number, aspect: number, output: number): Promise<ArrayBuffer> {
  const context = ImageManipulator.manipulate(uri);
  const targetW = Math.min(width, height * aspect);
  const targetH = targetW / aspect;
  if (Math.abs(width / height - aspect) > 0.01) context.crop({ originX: Math.round((width - targetW) / 2), originY: Math.round((height - targetH) / 2), width: Math.round(targetW), height: Math.round(targetH) });
  if (targetW > output) context.resize({ width: output });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
  image.release();
  return fromBase64(result.base64 ?? "");
}

// The whole photo, shrunk, so a profile picture can be re-cropped on the website later.
async function shrink(uri: string, width: number, height: number): Promise<ArrayBuffer> {
  const context = ImageManipulator.manipulate(uri);
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  if (scale < 1) context.resize({ width: Math.round(width * scale) });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.82, base64: true });
  image.release();
  return fromBase64(result.base64 ?? "");
}

// The phone's photo library. One photo: the phone's own cropper, to the
// right shape. Several: each is cropped to the shape, centred.
export async function pickPhotos({ count, aspect, output = 1080, keepOriginal = false }: PickOptions): Promise<Picked[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error("Function needs access to your photos. Allow it in your phone's settings.");
  const ratio: [number, number] = aspect === 1 ? [1, 1] : [4, 5];
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: count > 1, selectionLimit: count, allowsEditing: count === 1, aspect: ratio, quality: 1, exif: false });
  if (result.canceled) return [];
  const picked: Picked[] = [];
  for (const asset of result.assets.slice(0, count)) {
    const bytes = await prepare(asset.uri, asset.width, asset.height, aspect, output);
    picked.push({ bytes, type: "image/jpeg", ...(keepOriginal ? { original: { bytes: await shrink(asset.uri, asset.width, asset.height), type: "image/jpeg" } } : {}) });
  }
  return picked;
}

export async function cropExisting(): Promise<Picked | null> {
  return null;
}
