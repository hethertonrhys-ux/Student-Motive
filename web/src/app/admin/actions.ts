"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Every action re-checks that the caller is a Motive admin.
// The database security rules check again, so both must agree.

export async function approveClaim(claimId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data: claim } = await supabase
    .from("society_claims")
    .select("society_id, user_id")
    .eq("id", claimId)
    .single();
  if (!claim) return;

  await supabase
    .from("society_admins")
    .upsert({ society_id: claim.society_id, user_id: claim.user_id }, { ignoreDuplicates: true });
  await supabase
    .from("society_claims")
    .update({ status: "approved", reviewed_at: new Date().toISOString() })
    .eq("id", claimId);
  revalidatePath("/admin");
}

export async function rejectClaim(claimId: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("society_claims")
    .update({ status: "rejected", reviewed_at: new Date().toISOString() })
    .eq("id", claimId);
  revalidatePath("/admin");
}

export async function hideReportedEvent(reportId: string, eventId: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("events").update({ is_hidden: true }).eq("id", eventId);
  await supabase.from("reports").update({ status: "resolved" }).eq("id", reportId);
  revalidatePath("/admin");
}

export async function dismissReport(reportId: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("reports").update({ status: "dismissed" }).eq("id", reportId);
  revalidatePath("/admin");
}

export type AddSocietyState = { error?: string; added?: string };

export async function addSociety(_prev: AddSocietyState, formData: FormData): Promise<AddSocietyState> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const kind = String(formData.get("kind") ?? "society");
  if (!name) return { error: "Enter a name." };
  if (!["society", "hall", "university", "promoter"].includes(kind)) return { error: "Choose a type." };

  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return { error: "That name needs some letters or numbers." };

  const supabase = await createClient();
  const { error } = await supabase.from("societies").insert({ name, slug, kind, is_verified: true });
  if (error) {
    if (error.code === "23505") return { error: `There's already a society with the link /s/${slug}.` };
    return { error: "Couldn't add it. Please try again." };
  }
  revalidatePath("/admin");
  return { added: name };
}

// ---- Who can join: emails (or whole domains) allowed besides @lse.ac.uk ----

export type AllowEmailState = { error?: string; added?: string };

export async function allowEmail(_prev: AllowEmailState, formData: FormData): Promise<AllowEmailState> {
  await requireAdmin();
  let email = String(formData.get("email") ?? "").trim().toLowerCase();
  const note = String(formData.get("note") ?? "").trim().slice(0, 120) || null;
  // "kcl.ac.uk" on its own means the whole domain.
  if (/^[^@\s]+\.[^@\s]+$/.test(email)) email = `@${email}`;

  if (!/^([^@\s]+)?@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Enter an email like jo@gmail.com, or a whole domain like @kcl.ac.uk." };
  }
  if (email.endsWith("@lse.ac.uk")) return { error: "LSE emails can already join." };

  const supabase = await createClient();
  const { error } = await supabase.from("allowed_emails").upsert({ email, note });
  if (error) return { error: "That didn't save. Try again." };
  revalidatePath("/admin");
  return { added: email };
}

export async function removeAllowedEmail(email: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("allowed_emails").delete().eq("email", email);
  revalidatePath("/admin");
}
