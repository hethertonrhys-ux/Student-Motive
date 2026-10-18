"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { PhotoCropper } from "@/components/photo-cropper";
import { decodePhoto } from "@/lib/compress-photo";
import { archivePhoto, uploadMyFivePhoto, type Result } from "./my-five-actions";

type Photo = { id: string; url: string | null };

// The owner's view of their 5 photos: add and remove. Photos stay until
// removed; removed ones go to the Archive (restore or delete them there).
export function MyFive({ photos, archived }: { photos: Photo[]; archived: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const full = photos.length >= 5;
  // Photos picked together are cropped one by one, then uploaded.
  const [crop, setCrop] = useState<{ files: File[]; index: number; image: ImageBitmap; done: File[] } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) setError(r.error);
    });

  // Pick several at once (up to the free spaces), then crop each to the
  // shape it's shown in on your profile.
  function choose(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (input.current) input.current.value = "";
    if (picked.length === 0) return;
    const free = 5 - photos.length;
    setError(picked.length > free ? `You picked ${picked.length} photos but there ${free === 1 ? "is 1 space" : `are ${free} spaces`} left, so the first ${free === 1 ? "one was" : `${free} were`} kept.` : null);
    void cropNext(picked.slice(0, free), 0, []);
  }

  async function cropNext(files: File[], index: number, done: File[]) {
    if (index >= files.length) {
      setCrop(null);
      if (done.length) upload(done);
      return;
    }
    try {
      setCrop({ files, index, image: await decodePhoto(files[index]), done });
    } catch (e) {
      setError(
        (e as Error).message === "too-big"
          ? "A photo was over 15MB, so it was skipped."
          : "A file wasn't a photo we can use (try JPG, PNG or HEIC), so it was skipped.",
      );
      void cropNext(files, index + 1, done);
    }
  }

  function upload(files: File[]) {
    start(async () => {
      for (const [i, file] of files.entries()) {
        setProgress(files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : "Uploading…");
        const form = new FormData();
        form.append("photo", file);
        const r = await uploadMyFivePhoto(form);
        if (r.error) {
          setError(r.error);
          break;
        }
      }
      setProgress(null);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">My 5</h2>
          <p className="text-sm text-muted">Photos of things you like or get up to. They stay until you remove them.</p>
        </div>
        <span className="shrink-0 text-sm font-bold text-muted">{photos.length}/5</span>
      </div>

      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {photos.map((p) => (
          <li key={p.id} className="relative aspect-square overflow-hidden rounded-xl border border-line bg-line">
            {p.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.url} alt="" className="size-full object-cover" />
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                confirm("Remove this photo from your profile? It goes to your Archive, where you can put it back or delete it.") &&
                run(() => archivePhoto(p.id))
              }
              aria-label="Remove photo"
              className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-black/60 text-white shadow transition hover:bg-black/80"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="size-3.5" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </li>
        ))}
        {!full && (
          <li>
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-muted transition hover:border-brand hover:text-brand"
            >
              <span className="text-2xl">{busy ? "…" : "+"}</span>
              <span className="text-xs font-semibold">{busy ? progress ?? "Working…" : photos.length < 4 ? "Add photos" : "Add photo"}</span>
            </button>
          </li>
        )}
      </ul>

      {full && <p className="text-sm font-medium text-muted">All 5 spaces are full. Remove one to add another.</p>}
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
      <Link href="/account/archive" className="inline-block text-sm font-semibold text-brand">
        Archive{archived ? ` (${archived})` : ""} →
      </Link>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
        className="hidden"
        onChange={(e) => choose(e.target.files)}
      />
      {crop && (
        <PhotoCropper
          key={crop.index}
          image={crop.image}
          aspect={4 / 5}
          title={crop.files.length > 1 ? `Crop photo ${crop.index + 1} of ${crop.files.length}` : "Crop your photo"}
          doneLabel={crop.index < crop.files.length - 1 ? "Next" : crop.files.length > 1 ? "Add photos" : "Add photo"}
          cancelLabel={crop.files.length > 1 ? "Skip" : "Cancel"}
          onDone={(photo) => {
            crop.image.close();
            void cropNext(crop.files, crop.index + 1, [...crop.done, photo]);
          }}
          onCancel={() => {
            crop.image.close();
            void cropNext(crop.files, crop.index + 1, crop.done);
          }}
        />
      )}
    </div>
  );
}
