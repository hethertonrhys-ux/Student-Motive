import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { accountDetailsMissing } from "@function/shared";
import { needsSecondFactor } from "@/lib/mfa";
import { useProfile } from "@/lib/profile";
import { useSession } from "@/providers/session";

// Two things every logged-in person must do before using the app:
// 1. give the 2FA code if their account has 2FA on (sent to /mfa);
// 2. have their account details (full name, graduation year): accounts made
//    before those existed are sent to /welcome to fill them in.
// Public pages (landing, legal, install, login) are never gated.
const OPEN = new Set(["/", "/login", "/welcome", "/mfa", "/privacy", "/terms", "/support", "/install", "/lse", "/ucl", "/kings", "/imperial"]);

export function AccountGate() {
  const { session } = useSession();
  const { profile } = useProfile();
  const pathname = usePathname();
  const router = useRouter();
  const lastChecked = useRef<string | null>(null);

  const userId = session?.user.id ?? null;
  const missing = accountDetailsMissing(profile);
  useEffect(() => {
    if (!userId || !profile || !pathname) return;
    if (OPEN.has(pathname) || pathname.startsWith("/auth")) return;
    const key = `${userId}:${pathname}:${missing}`;
    if (lastChecked.current === key) return;
    lastChecked.current = key;
    let cancelled = false;
    void needsSecondFactor().then((needs) => {
      if (cancelled) return;
      if (needs) router.replace({ pathname: "/mfa", params: { next: pathname } } as never);
      else if (missing) router.replace({ pathname: "/welcome", params: { next: pathname } } as never);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, profile, pathname, missing, router]);

  return null;
}
