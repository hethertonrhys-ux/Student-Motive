"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// The tabs along the top. The one for the page you're on is highlighted.
export function NavTabs({ tabs }: { tabs: { href: string; label: string; badge?: number }[] }) {
  const pathname = usePathname();
  return tabs.map((tab) => {
    const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
    return (
      <Link
        key={tab.href}
        href={tab.href}
        aria-current={active ? "page" : undefined}
        className={`relative rounded-lg px-2 py-2 whitespace-nowrap transition sm:px-3 ${
          active ? "bg-brand-soft text-brand" : "text-muted hover:bg-brand-soft hover:text-ink"
        }`}
      >
        {tab.label}
        {tab.badge ? (
          <span className="absolute -top-0.5 -right-1 grid min-w-[18px] place-items-center rounded-full bg-live px-1 text-[10px] leading-[18px] font-bold text-white">
            {tab.badge > 9 ? "9+" : tab.badge}
          </span>
        ) : null}
      </Link>
    );
  });
}

// The cog in the top right: help, terms, privacy and signing out.
export function SettingsMenu({ signedInAs, isAdmin = false }: { signedInAs: string | null; isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close when you go to another page, tap elsewhere, or press Escape.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "block w-full rounded-lg px-3 py-2.5 text-left hover:bg-brand-soft";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Settings"
        aria-expanded={open}
        className={`grid size-10 place-items-center rounded-lg transition ${open ? "bg-brand-soft text-brand" : "text-muted hover:bg-brand-soft hover:text-ink"}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 rounded-2xl border border-line bg-surface p-1.5 text-sm font-semibold shadow-xl">
          {signedInAs && (
            <p className="truncate border-b border-line px-3 pt-1.5 pb-2.5 text-xs font-medium text-muted">
              Signed in as <span className="text-ink">{signedInAs}</span>
            </p>
          )}
          {signedInAs && <Link href="/account" className={item}>Edit your profile</Link>}
          {signedInAs && <Link href="/social/new" className={item}>Host an event</Link>}
          {isAdmin && <Link href="/admin" className={item}>Admin</Link>}
          <Link href="/install" className={item}>Get the app on your phone</Link>
          <Link href="/support" className={item}>Help &amp; support</Link>
          <Link href="/terms" className={item}>Terms of use</Link>
          <Link href="/privacy" className={item}>Privacy</Link>
          {signedInAs && (
            <form action="/auth/signout" method="post" className="mt-1 border-t border-line pt-1">
              <button className={`${item} text-danger`}>Sign out</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
