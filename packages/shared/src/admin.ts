import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET } from "./profile-photos";
import { getCards, type PersonCard } from "./social";
import type { Society } from "./types";
import { uniById, uniFromEmail } from "./universities";

// The Function team's admin page: requests to manage societies, reports,
// reported photos, who can join, and adding societies. The database only
// lets Function admins read and change these.

type Result = { error?: string };

export type AdminClaim = { id: string; committee_role: string | null; message: string | null; created_at: string; societies: { name: string; university: string } | null; profiles: { email: string } | null };
export type AdminReport = {
  id: string;
  reason: string;
  details: string | null;
  created_at: string;
  event_id: string | null;
  message_id: string | null;
  reported_user_id: string | null;
  events: { title: string } | null;
  societies: { name: string } | null;
  messages: { body: string; sender_id: string | null; deleted_at: string | null } | null;
};
export type ReportedPhoto = { photoId: string; path: string; url: string | null; userId: string; reasons: string[] };
export type AdminPage = {
  claims: AdminClaim[];
  reports: AdminReport[];
  reportedPhotos: ReportedPhoto[];
  societies: Society[];
  allowed: { email: string; note: string | null }[];
  people: Map<string, PersonCard>;
};

export async function loadAdmin(supabase: SupabaseClient): Promise<AdminPage> {
  const [{ data: claims }, { data: reports }, { data: societies }, { data: allowed }, { data: photoReports }] = await Promise.all([
    supabase.from("society_claims").select("id, committee_role, message, created_at, societies(name, university), profiles(email)").eq("status", "pending").order("created_at"),
    supabase.from("reports").select("id, reason, details, created_at, event_id, message_id, reported_user_id, events(title), societies(name), messages(body, sender_id, deleted_at)").eq("status", "open").order("created_at"),
    supabase.from("societies").select("*").order("kind").order("name"),
    supabase.from("allowed_emails").select("email, note").order("email"),
    supabase.from("profile_photo_reports").select("photo_id, reason, created_at, profile_photos(path, user_id)").eq("status", "open").order("created_at"),
  ]);
  type PhotoReportRow = { photo_id: string; reason: string; profile_photos: { path: string; user_id: string } | null };
  const byPhoto = new Map<string, { path: string; user_id: string; reasons: string[] }>();
  for (const r of (photoReports ?? []) as unknown as PhotoReportRow[]) {
    if (!r.profile_photos) continue;
    const p = byPhoto.get(r.photo_id) ?? { ...r.profile_photos, reasons: [] };
    p.reasons.push(r.reason);
    byPhoto.set(r.photo_id, p);
  }
  const list = [...byPhoto.entries()];
  const { data: signed } = list.length ? await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(list.map(([, p]) => p.path), 3600) : { data: [] };
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const reportList = (reports ?? []) as unknown as AdminReport[];
  const people = await getCards(supabase, [...reportList.flatMap((r) => [r.reported_user_id, r.messages?.sender_id]), ...list.map(([, p]) => p.user_id)].filter((x): x is string => !!x));
  return {
    claims: (claims ?? []) as unknown as AdminClaim[],
    reports: reportList,
    reportedPhotos: list.map(([photoId, p]) => ({ photoId, path: p.path, url: urls.get(p.path) ?? null, userId: p.user_id, reasons: p.reasons })),
    societies: (societies ?? []) as Society[],
    allowed: (allowed ?? []) as { email: string; note: string | null }[],
    people,
  };
}

const ok = ({ error }: { error: { message: string } | null }): Result => (error ? { error: "That didn't save. Try again." } : {});

export async function approveClaim(supabase: SupabaseClient, claimId: string): Promise<Result> {
  const { data: claim } = await supabase.from("society_claims").select("society_id, user_id").eq("id", claimId).single();
  if (!claim) return { error: "Request not found." };
  await supabase.from("society_admins").upsert({ society_id: claim.society_id, user_id: claim.user_id }, { ignoreDuplicates: true });
  return ok(await supabase.from("society_claims").update({ status: "approved", reviewed_at: new Date().toISOString() }).eq("id", claimId));
}
export const rejectClaim = async (supabase: SupabaseClient, claimId: string): Promise<Result> => ok(await supabase.from("society_claims").update({ status: "rejected", reviewed_at: new Date().toISOString() }).eq("id", claimId));

export async function hideReportedEvent(supabase: SupabaseClient, reportId: string, eventId: string): Promise<Result> {
  await supabase.from("events").update({ is_hidden: true }).eq("id", eventId);
  return ok(await supabase.from("reports").update({ status: "resolved" }).eq("id", reportId));
}
export async function deleteReportedMessage(supabase: SupabaseClient, reportId: string, messageId: string): Promise<Result> {
  await supabase.rpc("delete_message", { mid: messageId });
  return ok(await supabase.from("reports").update({ status: "resolved" }).eq("id", reportId));
}
export const dismissReport = async (supabase: SupabaseClient, reportId: string): Promise<Result> => ok(await supabase.from("reports").update({ status: "dismissed" }).eq("id", reportId));

// Remove a reported "My 5" photo (the file and the record) and close its reports.
export async function removeReportedPhoto(supabase: SupabaseClient, photoId: string): Promise<Result> {
  const { data } = await supabase.from("profile_photos").delete().eq("id", photoId).select("path");
  if (data?.[0]) await supabase.storage.from(PHOTO_BUCKET).remove([(data[0] as { path: string }).path]);
  return {};
}
export const dismissPhotoReports = async (supabase: SupabaseClient, photoId: string): Promise<Result> => ok(await supabase.from("profile_photo_reports").update({ status: "dismissed" }).eq("photo_id", photoId).eq("status", "open"));

export const SOCIETY_KINDS = [
  { value: "society", label: "Society" },
  { value: "hall", label: "Hall" },
  { value: "university", label: "University" },
  { value: "promoter", label: "Club night / promoter" },
];

export async function addSociety(supabase: SupabaseClient, input: { name: string; kind: string; university: string }): Promise<{ error?: string; added?: string }> {
  const name = input.name.trim().slice(0, 120);
  if (!name) return { error: "Enter a name." };
  if (!SOCIETY_KINDS.some((k) => k.value === input.kind)) return { error: "Choose a type." };
  const university = uniById(input.university)?.id;
  if (!university) return { error: "Choose a uni." };
  const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) return { error: "That name needs some letters or numbers." };
  const { error } = await supabase.from("societies").insert({ name, slug, kind: input.kind, university, is_verified: true });
  if (error) return { error: error.code === "23505" ? `There's already a society with the link /s/${slug}.` : "Couldn't add it. Please try again." };
  return { added: name };
}

// Who can join: emails (or whole domains) allowed besides the four unis' emails.
export async function allowEmail(supabase: SupabaseClient, input: { email: string; note: string }): Promise<{ error?: string; added?: string }> {
  let email = input.email.trim().toLowerCase();
  const note = input.note.trim().slice(0, 120) || null;
  if (/^[^@\s]+\.[^@\s]+$/.test(email)) email = `@${email}`; // "kcl.ac.uk" on its own means the whole domain
  if (!/^([^@\s]+)?@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter an email like jo@gmail.com, or a whole domain like @kcl.ac.uk." };
  if (uniFromEmail(email.replace(/^@/, "x@"))) return { error: "University emails can already join." };
  const { error } = await supabase.from("allowed_emails").upsert({ email, note });
  return error ? { error: "That didn't save. Try again." } : { added: email };
}
export const removeAllowedEmail = async (supabase: SupabaseClient, email: string): Promise<Result> => ok(await supabase.from("allowed_emails").delete().eq("email", email));
