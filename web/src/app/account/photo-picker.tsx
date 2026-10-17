"use client";

import { useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { removeProfilePhoto, uploadProfilePhoto } from "./actions";

const SIZE = 512;

// Crop the middle square of a photo and shrink it to 512px, in the browser,
// so uploads are small and quick even on mobile data.
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(SIZE, side);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("resize"))), "image/jpeg", 0.85));
}

export function PhotoPicker({ name, url }: { name: string; url: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(url);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    start(async () => {
      try {
        const blob = await squareJpeg(file);
        setPreview(URL.createObjectURL(blob));
        const form = new FormData();
        form.append("photo", new File([blob], "photo.jpg", { type: "image/jpeg" }));
        const result = await uploadProfilePhoto(form);
        if (result.error) setError(result.error);
        else setCurrent(result.url ?? null);
      } catch {
        setError("That file isn't a photo we can use. Try another.");
      } finally {
        setPreview(null);
        if (input.current) input.current.value = "";
      }
    });
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar name={name || "You"} url={preview ?? current} size={80} />
        {pending && <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40 text-xs font-bold text-white">…</span>}
      </div>
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => input.current?.click()} disabled={pending} className="btn py-2">
            {pending ? "Uploading…" : current ? "Change photo" : "Add a photo"}
          </button>
          {current && !pending && (
            <button
              type="button"
              onClick={() =>
                start(async () => {
                  await removeProfilePhoto();
                  setCurrent(null);
                })
              }
              className="btn-ghost py-2"
            >
              Remove
            </button>
          )}
        </div>
        <p className="text-xs text-muted">A clear photo of you helps friends find you.</p>
        {error && <p className="text-sm font-medium text-danger">{error}</p>}
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
    </div>
  );
}
