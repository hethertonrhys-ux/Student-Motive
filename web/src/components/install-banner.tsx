"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { oneTapInstall, useCanOneTapInstall, useDevice } from "@/lib/install";

const DISMISSED_KEY = "motive-install-banner-dismissed";
const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
};
const remember = () => {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {}
};
const noSubscribe = () => () => {};

// Once it's installed (Android tells us), the banner never comes back.
if (typeof window !== "undefined") window.addEventListener("appinstalled", remember);

// The share icon, as Safari draws it, so people know what to look for.
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline size-4 -translate-y-px text-brand" aria-label="Share">
      <path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 00-1 1v8a1 1 0 001 1h14a1 1 0 001-1v-8a1 1 0 00-1-1h-1" />
    </svg>
  );
}

// A slim bar under the header on phones, until Function is on the home
// screen or the bar is closed. iPhone: the two steps, right there.
// Android: the phone's own Install prompt.
export function InstallBanner() {
  const device = useDevice();
  const canOneTap = useCanOneTapInstall();
  const pathname = usePathname();
  const dismissedBefore = useSyncExternalStore(noSubscribe, readDismissed, () => true);
  const [dismissed, setDismissed] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  const show =
    device !== null &&
    device.platform !== "other" &&
    !device.installed &&
    !dismissedBefore &&
    !dismissed &&
    !pathname.startsWith("/install");
  // In Safari on iPhone the steps fit in the bar; elsewhere (other iPhone
  // browsers, apps like Instagram) the install page explains what to do.
  const iphoneSteps = device?.platform === "iphone" && device.iphoneBrowser === "safari" && !device.inAppBrowser;

  // The map sizes itself to the screen, so tell it how tall this bar is.
  useEffect(() => {
    document.documentElement.style.setProperty("--banner-h", show && bar.current ? `${bar.current.offsetHeight}px` : "0px");
  }, [show, iphoneSteps, canOneTap]);

  if (!show) return null;

  function dismiss() {
    remember();
    setDismissed(true);
  }

  return (
    <div ref={bar} className="flex items-center gap-2.5 border-b border-line bg-brand-soft px-4 py-2 text-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon/192" alt="" width={28} height={28} className="size-7 shrink-0 rounded-lg" />
      {iphoneSteps ? (
        <p className="min-w-0 flex-1 leading-snug">
          <span className="font-semibold">Add Function to your Home Screen:</span> tap <ShareIcon /> Share, then &ldquo;Add to Home Screen&rdquo;.
        </p>
      ) : (
        <span className="min-w-0 flex-1 truncate font-semibold">Get Function on your phone</span>
      )}
      {canOneTap ? (
        <button
          type="button"
          onClick={async () => {
            if (await oneTapInstall()) dismiss();
          }}
          className="shrink-0 rounded-lg bg-brand px-3 py-1 font-bold text-brand-ink"
        >
          Install
        </button>
      ) : (
        !iphoneSteps && (
          <Link href="/install" className="shrink-0 rounded-lg bg-brand px-3 py-1 font-bold text-brand-ink">
            Show me
          </Link>
        )
      )}
      <button type="button" onClick={dismiss} aria-label="Hide" className="shrink-0 px-1 text-lg leading-none text-muted">
        ×
      </button>
    </div>
  );
}
