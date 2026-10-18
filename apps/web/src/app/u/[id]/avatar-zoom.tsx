"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/avatar";

// The profile picture; tap it to see it big (like Instagram). Tap anywhere
// or press Escape to close.
export function AvatarZoom({ name, url, size }: { name: string; url: string | null; size: number }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  if (!url) return <Avatar name={name} url={url} size={size} />;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`See ${name}'s photo larger`} className="rounded-full">
        <Avatar name={name} url={url} size={size} />
      </button>
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${name}'s photo`}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black/85 p-6"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={name} className="aspect-square w-full max-w-sm rounded-full object-cover shadow-2xl" />
            <p className="font-display text-lg font-bold text-white">{name}</p>
          </div>,
          document.body,
        )}
    </>
  );
}
