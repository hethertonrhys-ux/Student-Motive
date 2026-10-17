"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";

export type LoginState = {
  step: "email" | "code";
  email?: string;
  error?: string;
};

function isLseEmail(email: string) {
  return email.endsWith("@lse.ac.uk");
}

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
    // Other emails only work if the Motive team has allowed them (Admin page).
    // Otherwise the database refuses to create the account.
    if (!isLseEmail(email)) {
      return {
        step: "email",
        email,
        error: "Motive is for @lse.ac.uk emails. If you've been invited with a different email, check it's typed exactly.",
      };
    }
    // While building on your own computer, show the real reason to help fix it.
    const detail = process.env.NODE_ENV === "development" ? ` (${error.status ?? ""} ${error.message})` : "";
    return { step: "email", email, error: `We couldn't send the email. Please try again.${detail}` };
  }

  return { step: "code", email };
}

export async function verifyCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  const next = String(formData.get("next") ?? "/dashboard");

  if (!/^\d{6,10}$/.test(token)) {
    return { step: "code", email, error: "Enter the code from the email." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

  if (error) {
    return { step: "code", email, error: "That code didn't work. Check it, or send a new one." };
  }

  // Only allow redirects within this site.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}
