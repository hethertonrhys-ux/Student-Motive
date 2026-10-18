"use client";

import { useState, useTransition } from "react";
import { deletePhoto, restorePhoto, type Result } from "../my-five-actions";

export function ArchiveGrid({ photos, canRestore }: { photos: { id: string; url: string | null }[]; canRestore: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) setError(r.error);
    });

  if (photos.length === 0) return <div className="card mt-6 py-10 text-center text-muted">Nothing in your Archive yet.</div>;

  return (
    <>
      {error && <p className="mt-4 text-sm font-medium text-danger">{error}</p>}
      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p) => (
          <li key={p.id} className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="aspect-square bg-line">
              {p.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt="" className="size-full object-cover" />
              )}
            </div>
            <div className="flex justify-between gap-2 px-2 py-2 text-sm font-semibold">
              <button type="button" disabled={busy || !canRestore} onClick={() => run(() => restorePhoto(p.id))} className="text-brand disabled:text-muted">
                Restore
              </button>
              <button type="button" disabled={busy} onClick={() => confirm("Delete this photo for good?") && run(() => deletePhoto(p.id))} className="text-danger">
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
