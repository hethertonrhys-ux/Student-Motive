"use client";

import { useRef, useState } from "react";
import { reportPhoto } from "@/app/account/my-five-actions";

// Swipe sideways through someone's current photos.
export function PhotoGallery({ photos, canReport }: { photos: { id: string; url: string | null }[]; canReport: boolean }) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [reported, setReported] = useState<Set<string>>(new Set());

  const go = (i: number) => strip.current?.scrollTo({ left: i * strip.current.clientWidth, behavior: "smooth" });

  async function report(id: string) {
    const reason = prompt("Why are you reporting this photo?", "Inappropriate");
    if (!reason) return;
    const r = await reportPhoto(id, reason);
    if (r.error) alert(r.error);
    else setReported((s) => new Set(s).add(id));
  }

  const current = photos[index];
  return (
    <div>
      <div className="relative">
        <div
          ref={strip}
          onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl [scrollbar-width:none]"
        >
          {photos.map((p, i) => (
            <div key={p.id} className="aspect-[4/5] w-full shrink-0 snap-center bg-line">
              {p.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt={`Photo ${i + 1} of ${photos.length}`} className="size-full object-cover" loading={i === 0 ? "eager" : "lazy"} />
              )}
            </div>
          ))}
        </div>
        {photos.length > 1 && (
          <>
            {index > 0 && (
              <button type="button" onClick={() => go(index - 1)} aria-label="Previous photo" className="absolute top-1/2 left-2 hidden size-9 -translate-y-1/2 place-items-center rounded-full bg-white/80 text-xl shadow sm:grid">‹</button>
            )}
            {index < photos.length - 1 && (
              <button type="button" onClick={() => go(index + 1)} aria-label="Next photo" className="absolute top-1/2 right-2 hidden size-9 -translate-y-1/2 place-items-center rounded-full bg-white/80 text-xl shadow sm:grid">›</button>
            )}
            <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
              {photos.map((p, i) => (
                <button key={p.id} type="button" onClick={() => go(i)} aria-label={`Photo ${i + 1}`} className={`size-2 rounded-full ${i === index ? "bg-white" : "bg-white/50"}`} />
              ))}
            </div>
          </>
        )}
      </div>
      {canReport && current && (
        <div className="mt-2 text-right">
          {reported.has(current.id) ? (
            <span className="text-xs font-semibold text-muted">Reported. Thanks.</span>
          ) : (
            <button type="button" onClick={() => report(current.id)} className="text-xs font-semibold text-muted hover:text-danger">
              Report photo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
