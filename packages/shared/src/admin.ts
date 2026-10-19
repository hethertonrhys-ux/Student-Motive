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

// ---- Admin panel: user lookup, every event, clearing out old events ----
// Each of these calls a database function that refuses anyone who isn't a
// Function admin, so the checks don't rely on the screen being hidden.

export type AdminUserRow = { id: string; email: string; name: string; full_name: string | null; university: string | null; graduation_year: number | null; country: string | null; created_at: string; is_admin: boolean };

export async function adminSearchUsers(supabase: SupabaseClient, query: string): Promise<AdminUserRow[]> {
  const { data, error } = await supabase.rpc("admin_search_users", { q: query.trim().slice(0, 80), max: 30 });
  if (error) throw error;
  return (data ?? []) as AdminUserRow[];
}

export type AdminUserDetail = {
  id: string; email: string; name: string; full_name: string | null; nickname: string | null; university: string | null; graduation_year: number | null; country: string | null; course: string | null;
  created_at: string; is_admin: boolean; email_confirmed_at: string | null; last_sign_in_at: string | null; two_factor: boolean; uni_email: boolean; details_complete: boolean;
  societies: { id: string; name: string; slug: string; status: string }[];
  runs: { id: string; name: string; slug: string }[];
  hosted_count: number; joined_count: number;
  hosted: { kind: "society" | "social"; id: string; title: string; starts_at: string; href: string }[];
  joined: { kind: "society" | "social"; id: string; title: string; starts_at: string; status: string; href: string }[];
  reports_against: { id: string; reason: string; details: string | null; status: string; created_at: string }[];
};

export async function adminUserDetail(supabase: SupabaseClient, id: string): Promise<AdminUserDetail | null> {
  const { data, error } = await supabase.rpc("admin_user_detail", { uid: id });
  if (error) throw error;
  return (data as AdminUserDetail | null) ?? null;
}

export type AdminEventRow = { kind: "society" | "social"; id: string; title: string; starts_at: string; ends_at: string; society_id: string | null; society_name: string | null; host_name: string | null; going: number; is_cancelled: boolean; is_hidden: boolean; results_published: boolean; image_url: string | null; href: string };
export type AdminEventFilters = { q: string; society: string; scope: "upcoming" | "past" | "all"; includeCancelled: boolean };
export const DEFAULT_ADMIN_EVENT_FILTERS: AdminEventFilters = { q: "", society: "", scope: "upcoming", includeCancelled: true };

export async function adminListEvents(supabase: SupabaseClient, f: AdminEventFilters): Promise<AdminEventRow[]> {
  const { data, error } = await supabase.rpc("admin_list_events", { q: f.q.trim().slice(0, 80) || null, society: f.society || null, scope: f.scope, include_cancelled: f.includeCancelled, max: 200 });
  if (error) throw error;
  return (data ?? []) as AdminEventRow[];
}

export type PastEventsSummary = { cutoff: string; society_events: number; social_events: number; images: number; skipped_results: number; skipped_protected: number };
export const DEFAULT_CLEANUP_DAYS = 90;

export async function adminPastEventsSummary(supabase: SupabaseClient, days = DEFAULT_CLEANUP_DAYS): Promise<PastEventsSummary> {
  const { data, error } = await supabase.rpc("admin_past_events_summary", { older_than_days: days });
  if (error) throw error;
  return data as PastEventsSummary;
}

// Image files have to go through the Storage API (deleting their database
// rows alone would leave the files behind), so: list them, remove them, then
// delete the events. Whatever the API couldn't remove, the delete function
// still clears from the database.
async function removeImageFiles(supabase: SupabaseClient, paths: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    try {
      const { data } = await supabase.storage.from("images").remove(paths.slice(i, i + 100));
      removed += data?.length ?? 0;
    } catch {
      // Left for the database function to tidy up.
    }
  }
  return removed;
}

export async function adminDeletePastEvents(supabase: SupabaseClient, days = DEFAULT_CLEANUP_DAYS): Promise<{ error?: string; deleted?: { society_events: number; social_events: number; images: number } }> {
  const { data: paths, error: listError } = await supabase.rpc("admin_past_event_images", { older_than_days: days });
  if (listError) return { error: "Couldn't delete them. Please try again." };
  const removed = await removeImageFiles(supabase, (paths ?? []) as string[]);
  const { data, error } = await supabase.rpc("admin_delete_past_events", { older_than_days: days });
  if (error) return { error: "Couldn't delete them. Please try again." };
  const d = data as { society_events: number; social_events: number; images: number };
  return { deleted: { ...d, images: d.images + removed } };
}

// A society's own committee clearing out their past events (and images).
export type SocietyPastSummary = { cutoff: string; events: number; images: number; skipped_results: number };

export async function societyPastEventsSummary(supabase: SupabaseClient, societyId: string, days = DEFAULT_CLEANUP_DAYS, keepResults = true): Promise<SocietyPastSummary> {
  const { data, error } = await supabase.rpc("society_past_events_summary", { sid: societyId, older_than_days: days, keep_results: keepResults });
  if (error) throw error;
  return data as SocietyPastSummary;
}

export async function deleteSocietyPastEvents(supabase: SupabaseClient, societyId: string, days = DEFAULT_CLEANUP_DAYS, keepResults = true): Promise<{ error?: string; deleted?: { events: number; images: number } }> {
  const { data: paths, error: listError } = await supabase.rpc("society_past_event_images", { sid: societyId, older_than_days: days, keep_results: keepResults });
  if (listError) return { error: "Couldn't delete them. Please try again." };
  const removed = await removeImageFiles(supabase, (paths ?? []) as string[]);
  const { data, error } = await supabase.rpc("delete_society_past_events", { sid: societyId, older_than_days: days, keep_results: keepResults });
  if (error) return { error: "Couldn't delete them. Please try again." };
  const d = data as { events: number; images: number };
  return { deleted: { ...d, images: d.images + removed } };
}

// Reports about Social plans (stored since the Social section launched; shown here from now on).
export type SocialReportRow = { id: string; reason: string; created_at: string; event_id: string; social_events: { title: string; host_id: string; is_hidden: boolean } | null };

export async function loadSocialReports(supabase: SupabaseClient): Promise<SocialReportRow[]> {
  const { data } = await supabase.from("social_reports").select("id, reason, created_at, event_id, social_events(title, host_id, is_hidden)").eq("status", "open").order("created_at");
  return (data ?? []) as unknown as SocialReportRow[];
}
export async function hideReportedSocialEvent(supabase: SupabaseClient, reportId: string, eventId: string): Promise<Result> {
  await supabase.from("social_events").update({ is_hidden: true }).eq("id", eventId);
  return ok(await supabase.from("social_reports").update({ status: "resolved" }).eq("id", reportId));
}
export const dismissSocialReport = async (supabase: SupabaseClient, reportId: string): Promise<Result> => ok(await supabase.from("social_reports").update({ status: "dismissed" }).eq("id", reportId));
