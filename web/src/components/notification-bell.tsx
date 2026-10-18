"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getNotificationTimes } from "@/app/notifications/actions";

// When you last opened Notifications, kept on this phone.
const SEEN_KEY = "fn-notifications-seen";
// On a phone that's never opened Notifications, the last few days count as new.
const FIRST_LOOK_DAYS = 3;

function seenAt() {
  try {
    const saved = Number(new Date(localStorage.getItem(SEEN_KEY) ?? NaN));
    if (saved) return saved;
  } catch {}
  return Date.now() - FIRST_LOOK_DAYS * 864e5;
}

// Called by the Notifications page when it's opened: clears the badge.
export function markNotificationsSeen() {
  try {
    localStorage.setItem(SEEN_KEY, new Date().toISOString());
  } catch {}
  window.dispatchEvent(new Event("fn-notifications"));
}

// The bell in the top bar, with a badge for anything new. Checked when the
// page opens, every minute, and when you come back to the app.
export function NotificationBell() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      getNotificationTimes().then((t) => {
        if (!alive) return;
        const seen = seenAt();
        setCount(t.posts.filter((at) => new Date(at).getTime() > seen).length);
      }, () => {});
    };
    check();
    window.addEventListener("fn-notifications", check);
    document.addEventListener("visibilitychange", check);
    const timer = setInterval(check, 60_000);
    return () => {
      alive = false;
      window.removeEventListener("fn-notifications", check);
      document.removeEventListener("visibilitychange", check);
      clearInterval(timer);
    };
  }, []);

  const here = pathname === "/notifications";
  return (
    <Link
      href="/notifications"
      aria-label={count ? `Notifications, ${count} new` : "Notifications"}
      className={`relative grid size-10 place-items-center rounded-lg transition ${here ? "bg-brand-soft text-brand" : "text-muted hover:bg-brand-soft hover:text-ink"}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
        <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 003.4 0" />
      </svg>
      {count > 0 && !here && (
        <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-live px-1 text-[10px] leading-4 font-bold text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
