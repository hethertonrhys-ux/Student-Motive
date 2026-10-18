"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getProfile } from "@/lib/auth";
import { MAX_ANSWER, MAX_PROMPTS, promptById } from "@/lib/prompts";
import { logSignupEvent, type SignupEvent } from "@/lib/signup-events";
import { createClient } from "@/lib/supabase/server";
import { WELCOMED_COOKIE } from "./constants";

// Saves the one answer from the welcome step as you type (replacing the
// prompt you'd picked before, if you switched). Any other answers are kept.
export async function saveWelcomePrompt(promptId: string, answer: string, previousId: string | null): Promise<{ error?: string }> {
  const me = await getProfile();
  if (!me) return { error: "Log in first." };
  const text = answer.trim().replace(/\s+/g, " ").slice(0, MAX_ANSWER);
  if (!text || !promptById(promptId)) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("profile_prompts").select("prompt_id, answer").eq("user_id", me.id).order("position");
  const others = ((data ?? []) as { prompt_id: string; answer: string }[]).filter((a) => a.prompt_id !== promptId && a.prompt_id !== previousId);
  const { error } = await supabase.rpc("save_profile_prompts", { answers: [{ prompt_id: promptId, answer: text }, ...others].slice(0, MAX_PROMPTS) });
  if (error) return { error: "Couldn't save. Your answer is kept on this screen; try again." };
  revalidatePath("/account");
  revalidatePath(`/u/${me.id}`);
  return {};
}

// The welcome step is done (finished or skipped): remember it, and count it.
export async function finishWelcome(event: Extract<SignupEvent, "prompts_skipped" | "prompts_completed">) {
  (await cookies()).set(WELCOMED_COOKIE, "1", { maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax", httpOnly: true });
  await logSignupEvent(await createClient(), event);
}

export async function welcomeReached() {
  await logSignupEvent(await createClient(), "prompts_step_reached");
}
