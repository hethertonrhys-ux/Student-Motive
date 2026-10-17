"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { oneTapInstall, useCanOneTapInstall, useDevice } from "@/lib/install";

const DISMISSED_KEY = "motive-install-banner-dismissed";
const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
};
const noSubscribe = () => () => {};

// A slim bar under the header on phones, until Function is on the home screen.
export function InstallBanner() {
  const device = useDevice();
  const canOneTap = useCanOneTapInstall();
  const pathname = usePathname();
  const dismissedBefore = useSyncExternalStore(noSubscribe, readDismissed, () => true);
  const [dismissed, setDismissed] = useState(false);

  const show =
    device !== null &&
    device.platform !== "other" &&
    !device.installed &&
    !dismissedBefore &&
    !dismissed &&
    !pathname.startsWith("/install");

  // The map sizes itself to the screen, so tell it how tall this bar is.
  useEffect(() => {
    document.documentElement.style.setProperty("--banner-h", show ? "2.75rem" : "0px");
  }, [show]);

  if (!show) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
    setDismissed(true);
  }

  return (
    <div className="flex h-11 items-center gap-2 border-b border-line bg-brand-soft px-4 text-sm">
      <span className="min-w-0 flex-1 truncate font-semibold">📲 Get Function on your phone</span>
      {canOneTap ? (
        <button type="button" onClick={() => oneTapInstall()} className="shrink-0 rounded-lg bg-brand px-3 py-1 font-bold text-brand-ink">
          Install
        </button>
      ) : (
        <Link href="/install" className="shrink-0 rounded-lg bg-brand px-3 py-1 font-bold text-brand-ink">
          Show me
        </Link>
      )}
      <button type="button" onClick={dismiss} aria-label="Hide" className="shrink-0 px-1 text-lg leading-none text-muted">
        ×
      </button>
    </div>
  );
}
