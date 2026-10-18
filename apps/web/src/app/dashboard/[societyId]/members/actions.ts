"use server";

import { revalidatePath } from "next/cache";
import { requireManagedSociety } from "@/lib/society";
import { uniFromEmail, uniShort } from "@/lib/universities";

// skipped: emails from another uni (societies are for their own uni's students).
export type InviteState = { error?: string; added?: number; skipped?: string[]; uni?: string };

export async function inviteMembers(societyId: string, _prev: InviteState, formData: FormData): Promise<InviteState> {
  const { supabase, society } = await requireManagedSociety(societyId);
  // Accept emails separated by new lines, commas, semicolons or spaces (e.g. pasted from a spreadsheet).
  const emails = String(formData.get("emails") ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (emails.length === 0) return { error: "Paste at least one email address." };
  if (emails.length > 2000) return { error: "That's over 2,000 emails. Add them in smaller batches." };

  const skipped = emails.filter((e) => {
    const uni = uniFromEmail(e);
    return uni && uni.id !== society.university;
  });
  const { data, error } = await supabase.rpc("invite_members", { sid: societyId, emails });
  if (error) return { error: "Couldn't add those members. Please try again." };
  revalidatePath(`/dashboard/${societyId}/members`);
  return { added: data as number, skipped, uni: uniShort(society.university) };
}

export async function approveMember(societyId: string, userId: string) {
  const { supabase } = await requireManagedSociety(societyId);
  await supabase
    .from("society_members")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("society_id", societyId)
    .eq("user_id", userId);
  revalidatePath(`/dashboard/${societyId}/members`);
}

export async function removeMember(societyId: string, userId: string) {
  const { supabase } = await requireManagedSociety(societyId);
  await supabase.from("society_members").delete().eq("society_id", societyId).eq("user_id", userId);
  revalidatePath(`/dashboard/${societyId}/members`);
}

export async function removeInvite(societyId: string, email: string) {
  const { supabase } = await requireManagedSociety(societyId);
  await supabase.from("society_member_invites").delete().eq("society_id", societyId).eq("email", email);
  revalidatePath(`/dashboard/${societyId}/members`);
}
