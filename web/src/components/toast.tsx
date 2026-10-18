"use client";

import { useEffect, useState } from "react";

// A short message at the bottom of the screen, e.g. when a tap didn't go
// through and the change has been undone. Call showToast() from anywhere.
export function showToast(message: string) {
  window.dispatchEvent(new CustomEvent("fn-toast", { detail: message }));
}

export function Toaster() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = (e: Event) => {
      setMessage((e as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 4000);
    };
    window.addEventListener("fn-toast", show);
    return () => {
      window.removeEventListener("fn-toast", show);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+0.75rem)] z-50 flex justify-center px-4">
      {message && (
        <p role="status" className="pointer-events-auto max-w-sm rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-surface shadow-lg">
          {message}
        </p>
      )}
    </div>
  );
}
