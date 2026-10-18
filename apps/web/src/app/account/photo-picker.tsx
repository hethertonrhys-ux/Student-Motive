"use client";

import { useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { PhotoCropper } from "@/components/photo-cropper";
import { compressPhoto, decodePhoto } from "@/lib/compress-photo";
import { getProfilePhotoOriginal, removeProfilePhoto, uploadProfilePhoto } from "./actions";

const SIZE = 512;

// The profile picture: pick a photo and fit it in the circle (zoom and
// drag), or re-fit the current one later without uploading it again.
export function PhotoPicker({ name, url }: { name: string; url: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(url);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // The photo being fitted, and (for a new photo) the file it came from.
  const [crop, setCrop] = useState<{ image: ImageBitmap; file: File | null } | null>(null);

  function choose(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    setError(null);
    decodePhoto(file).then(
      (image) => setCrop({ image, file }),
      () => setError("That file isn't a photo we can use. Try another."),
    );
  }

  // Re-crop: start from the whole original photo if we have it, otherwise
  // from the current picture (which can then only be zoomed in further).
  function adjust() {
    setError(null);
    start(async () => {
      try {
        const source = (await getProfilePhotoOriginal()) ?? current;
        if (!source) return;
        const res = await fetch(source, { cache: "no-store" });
        if (!res.ok) throw new Error("load");
        setCrop({ image: await createImageBitmap(await res.blob()), file: null });
      } catch {
        setError("Couldn't open your photo. Please try again.");
      }
    });
  }

  function save(circle: File, original: File | null) {
    start(async () => {
      try {
        setPreview(URL.createObjectURL(circle));
        const form = new FormData();
        form.append("photo", circle);
        // Keep the whole photo too, so it can be re-cropped later.
        if (original) form.append("original", await compressPhoto(original));
        const result = await uploadProfilePhoto(form);
        if (result.error) setError(result.error);
        else setCurrent(result.url ?? null);
      } catch {
        setError("That photo couldn't be saved. Please try again.");
      } finally {
        setPreview(null);
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
            {pending ? "Working…" : current ? "Change photo" : "Add a photo"}
          </button>
          {current && !pending && (
            <>
              <button type="button" onClick={adjust} className="btn-ghost py-2">
                Adjust
              </button>
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
            </>
          )}
        </div>
        <p className="text-xs text-muted">A clear photo of you helps friends find you.</p>
        {error && <p className="text-sm font-medium text-danger">{error}</p>}
      </div>
      <input ref={input} type="file" accept="image/*,.heic,.heif" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
      {crop && (
        <PhotoCropper
          image={crop.image}
          shape="circle"
          output={SIZE}
          title={crop.file ? "Fit your photo in the circle" : "Adjust your profile picture"}
          doneLabel="Save"
          onDone={(circle) => {
            const original = crop.file;
            crop.image.close();
            setCrop(null);
            save(circle, original);
          }}
          onCancel={() => {
            crop.image.close();
            setCrop(null);
          }}
        />
      )}
    </div>
  );
}
