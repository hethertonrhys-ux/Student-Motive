"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logSignupEvent } from "@/lib/signup-events";
import { WELCOMED_COOKIE } from "@/app/welcome/constants";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { applyArrivalUni } from "@/lib/arrival-uni";
import { ARRIVAL_UNI_COOKIE, uniFromEmail } from "@/lib/universities";

export type LoginState = {
  step: "email" | "code";
  email?: string;
  error?: string;
};

export async function sendCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = String(formData.get("next") ?? "/dashboard");

  if (!/^[^@\s]+@[^@\s]+$/.test(email)) {
    return { step: "email", email, error: "Enter a valid email address." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      // Used when the email contains a login link rather than a code.
      emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    console.error("Login email failed:", error.status, error.code, error.message);
    if (error.status === 429) {
      return { step: "email", email, error: "Too many attempts. Wait a few minutes and try again." };
    }
    // Other emails only work if the Function team has allowed them (Admin page).
    // Otherwise the database refuses to create the account.
    if (!uniFromEmail(email)) {
      return {
        step: "email",
        email,
        error: "Function is for students at LSE, UCL, King's and Imperial. Use your uni email, or the email you were invited with.",
      };
    }
    // While building on your own computer, show the real reason to help fix it.
    const detail = process.env.NODE_ENV === "development" ? ` (${error.status ?? ""} ${error.message})` : "";
    return { step: "email", email, error: `We couldn't send the email. Please try again.${detail}` };
  }

  return { step: "code", email };
}

// Accounts made in the last few minutes count as new (just signed up).
const NEW_ACCOUNT_MS = 15 * 60 * 1000;

export async function verifyCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  const next = String(formData.get("next") ?? "/dashboard");

  if (!/^\d{6,10}$/.test(token)) {
    return { step: "code", email, error: "Enter the code from the email." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

  if (error) {
    return { step: "code", email, error: "That code didn't work. Check it, or send a new one." };
  }

  // Only allow redirects within this site.
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  // A brand-new account: one optional "pick a prompt" screen, then on to the app.
  // (The account already exists at this point; that screen can be skipped.)
  const created = data.user?.created_at ? new Date(data.user.created_at).getTime() : 0;
  const jar = await cookies();
  if (Date.now() - created < NEW_ACCOUNT_MS && !jar.get(WELCOMED_COOKIE)) {
    await logSignupEvent(supabase, "signup_finished");
    await applyArrivalUni(supabase, data.user!.id, data.user!.email, jar.get(ARRIVAL_UNI_COOKIE)?.value);
    const { count } = await supabase.from("profile_prompts").select("prompt_id", { count: "exact", head: true }).eq("user_id", data.user!.id);
    if (!count) redirect(`/welcome?next=${encodeURIComponent(target)}`);
  }
  redirect(target);
}
