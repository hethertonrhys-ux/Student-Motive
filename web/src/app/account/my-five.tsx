"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { compressPhoto } from "@/lib/compress-photo";
import { archivePhoto, deletePhoto, pinPhoto, uploadMyFivePhoto, type Result } from "./my-five-actions";

type Photo = { id: string; url: string | null; pinned: boolean; daysLeft: number | null };

// The owner's view of their 5 photos: add, pin, archive, delete.
export function MyFive({ photos, archived }: { photos: Photo[]; archived: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const full = photos.length >= 5;

  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) setError(r.error);
    });

  function choose(file: File | undefined) {
    if (!file) return;
    start(async () => {
      setError(null);
      try {
        const small = await compressPhoto(file);
        const form = new FormData();
        form.append("photo", small);
        const r = await uploadMyFivePhoto(form);
        if (r.error) setError(r.error);
      } catch (e) {
        setError(
          (e as Error).message === "too-big"
            ? "That photo is over 15MB. Try a smaller one."
            : "That file isn't a photo we can use. Try a JPG, PNG or HEIC.",
        );
      } finally {
        if (input.current) input.current.value = "";
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">My 5</h2>
          <p className="text-sm text-muted">Photos of things you like or get up to. Each lasts 30 days unless you pin it.</p>
        </div>
        <span className="shrink-0 text-sm font-bold text-muted">{photos.length}/5</span>
      </div>

      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {photos.map((p) => (
          <li key={p.id} className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="relative aspect-square bg-line">
              {p.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt="" className="size-full object-cover" />
              )}
              <span className={`absolute top-1.5 left-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${p.pinned ? "bg-brand text-brand-ink" : "bg-black/60 text-white"}`}>
                {p.pinned ? "📌 Pinned" : `${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"} left`}
              </span>
            </div>
            <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs font-semibold">
              <button type="button" disabled={busy} onClick={() => run(() => pinPhoto(p.id, !p.pinned))} className="text-brand">
                {p.pinned ? "Unpin" : "Pin"}
              </button>
              <button type="button" disabled={busy} onClick={() => run(() => archivePhoto(p.id))} className="text-muted">Archive</button>
              <button
                type="button"
                disabled={busy}
                onClick={() => confirm("Delete this photo for good?") && run(() => deletePhoto(p.id))}
                className="text-danger"
                aria-label="Delete photo"
                title="Delete"
              >
                🗑
              </button>
            </div>
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
              <span className="text-xs font-semibold">{busy ? "Working…" : "Add photo"}</span>
            </button>
          </li>
        )}
      </ul>

      {full && <p className="text-sm font-medium text-muted">All 5 spaces are full. Archive or delete one to add another.</p>}
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
      <Link href="/account/archive" className="inline-block text-sm font-semibold text-brand">
        Archive{archived ? ` (${archived})` : ""} →
      </Link>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
    </div>
  );
}
