"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  step: "email" | "code";
  email?: string;
  error?: string;
};

function isAllowedEmail(email: string) {
  return email.endsWith("@lse.ac.uk");
}

export async function sendCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!/^[^@\s]+@[^@\s]+$/.test(email)) {
    return { step: "email", email, error: "Enter a valid email address." };
  }
  if (!isAllowedEmail(email)) {
    return { step: "email", email, error: "Please use your @lse.ac.uk email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    if (error.status === 429) {
      return { step: "email", email, error: "Too many attempts. Wait a few minutes and try again." };
    }
    return { step: "email", email, error: "We couldn't send the email. Please try again." };
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
