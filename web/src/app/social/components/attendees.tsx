"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/avatar";

type Person = { id: string; name: string; avatar_url: string | null };

// How many faces fit on a phone before the "+N more" button.
const SHOWN = 6;

// Who's going, as small round photos. The host sits first in their own spot;
// tapping a face opens that person's profile, and "+N more" opens everyone.
// People who aren't going only see the host and how many are going (the
// database only shares the guest list with the host and people going).
export function Attendees({ host, people, guests }: { host: Person | null; people: Person[] | null; guests: number }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  const extra = people ? people.length - SHOWN : 0;

  return (
    <section className="card mt-5" aria-label="Who's going">
      <div className="flex items-start gap-4">
        {host && (
          <Link href={`/u/${host.id}`} className="flex w-14 shrink-0 flex-col items-center gap-1 text-center">
            <Avatar name={host.name} url={host.avatar_url} size={48} />
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand">Host</span>
          </Link>
        )}
        <div className="min-w-0 flex-1 border-l border-line pl-4">
          <p className="text-sm font-semibold text-muted">
            {guests === 0 ? "Just the host so far" : `${guests + 1} going, including the host`}
          </p>
          {people && people.length > 0 ? (
            <ul className="mt-2 flex flex-wrap items-center gap-2">
              {people.slice(0, SHOWN).map((p) => (
                <li key={p.id}>
                  <Link href={`/u/${p.id}`} aria-label={p.name} className="block rounded-full">
                    <Avatar name={p.name} url={p.avatar_url} size={36} />
                  </Link>
                </li>
              ))}
              {extra > 0 && (
                <li>
                  <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="grid h-9 place-items-center rounded-full bg-brand-soft px-3 text-sm font-bold text-brand"
                  >
                    +{extra} more
                  </button>
                </li>
              )}
            </ul>
          ) : (
            guests > 0 && !people && <p className="mt-1 text-sm text-muted">Join to see who.</p>
          )}
        </div>
      </div>

      {open && people && createPortal(
        // Drawn on the page itself so it sits above the bottom tab bar.
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Everyone going"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">Going ({people.length + (host ? 1 : 0)})</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold text-muted">Close</button>
            </div>
            <ul className="mt-3 divide-y divide-line">
              {host && (
                <li>
                  <Link href={`/u/${host.id}`} className="flex items-center gap-3 py-2.5">
                    <Avatar name={host.name} url={host.avatar_url} size={40} />
                    <span className="flex-1 truncate font-semibold">{host.name}</span>
                    <span className="text-xs font-bold text-muted">Host</span>
                  </Link>
                </li>
              )}
              {people.map((p) => (
                <li key={p.id}>
                  <Link href={`/u/${p.id}`} className="flex items-center gap-3 py-2.5">
                    <Avatar name={p.name} url={p.avatar_url} size={40} />
                    <span className="truncate font-semibold">{p.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}
