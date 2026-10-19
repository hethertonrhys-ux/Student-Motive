import type { Factor } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// Two-factor authentication (2FA) helpers. Supabase keeps the factors; the
// app only asks for the code at the right moments.

// Verified factors on this account, authenticator apps first.
export async function verifiedFactors(): Promise<Factor[]> {
  const { data } = await supabase.auth.mfa.listFactors();
  const all = [...(data?.totp ?? []), ...(data?.phone ?? [])] as Factor[];
  return all.filter((f) => f.status === "verified");
}

// True when the account has 2FA switched on but this login hasn't given a
// code yet. Checked from the session itself (no network).
export async function needsSecondFactor(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return !!data && data.nextLevel === "aal2" && data.currentLevel !== "aal2";
  } catch {
    return false;
  }
}

// Plain-English version of Supabase's 2FA errors.
export function mfaErrorText(message: string | undefined) {
  const m = (message ?? "").toLowerCase();
  if (m.includes("not enabled") || m.includes("disabled") || m.includes("unsupported")) return "This kind of 2FA isn't switched on for Function yet. Ask the Function team.";
  if (m.includes("invalid") || m.includes("expired")) return "That code didn't work. Check it and try again.";
  if (m.includes("already")) return "You've already set this up.";
  return message || "Something went wrong. Please try again.";
}
