import type { SupabaseClient } from "@supabase/supabase-js";

// Reporting and blocking. Every report is saved in the database (who, what,
// why, when) and emailed to help@studentfunction.com (see
// 20261128000000_reporting_blocking.sql), so the team can review it within
// 24 hours. Blocking works both ways: neither person sees the other's
// profile or messages, or can find, add or message them.

type Result = { error?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const REPORT_REASONS = ["Harassment or bullying", "Inappropriate or explicit content", "Spam", "Fake account", "Something else"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

// What's being reported: a chat message (also a photo, video or shared
// event in a chat), an event listing, a Social plan, a person, or one of a
// person's profile photos.
export type ReportTarget =
  | { kind: "message"; id: string }
  | { kind: "event"; id: string }
  | { kind: "social"; id: string }
  | { kind: "user"; id: string }
  | { kind: "photo"; id: string };

export async function sendReport(supabase: SupabaseClient, target: ReportTarget, reason: string, note: string): Promise<Result> {
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) return { error: "Choose a reason." };
  if (!UUID.test(target.id)) return { error: "Couldn't send the report. Please try again." };
  const details = note.trim().slice(0, 2000) || null;
  const { error } =
    target.kind === "social"
      ? await supabase.from("social_reports").insert({ event_id: target.id, reason, details })
      : target.kind === "photo"
        ? // Photo reports have no note column: the note goes with the reason.
          await supabase.from("profile_photo_reports").insert({ photo_id: target.id, reason: (details ? `${reason}: ${details}` : reason).slice(0, 200) })
        : await supabase.from("reports").insert({
            ...(target.kind === "message" ? { message_id: target.id } : target.kind === "event" ? { event_id: target.id } : { reported_user_id: target.id }),
            reason,
            details,
          });
  return error ? { error: "Couldn't send the report. Please try again." } : {};
}

// ---- Blocking ----

export type BlockedPerson = { user_id: string; name: string; avatar_url: string | null; blocked_at: string };

// The people you've blocked, for Settings → Privacy.
export async function loadBlockedPeople(supabase: SupabaseClient): Promise<BlockedPerson[]> {
  const { data, error } = await supabase.rpc("my_blocked_people");
  if (error) throw error;
  return (data ?? []) as BlockedPerson[];
}

// Whether you blocked this person (not whether they blocked you).
export async function iBlocked(supabase: SupabaseClient, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const { data } = await supabase.rpc("i_blocked", { target: id });
  return data === true;
}

// ---- Bans (the Function team only) ----

export type AccountBan = { user_id: string; until: string | null; reason: string; created_at: string };

export async function loadAccountBan(supabase: SupabaseClient, userId: string): Promise<AccountBan | null> {
  const { data } = await supabase.from("account_bans").select("user_id, until, reason, created_at").eq("user_id", userId).maybeSingle();
  return (data as AccountBan | null) ?? null;
}

// days: a suspension of that many days, or null for a ban with no end date.
export async function adminSetBan(supabase: SupabaseClient, userId: string, days: number | null, reason: string): Promise<Result> {
  if (!reason.trim()) return { error: "Say why (the reason is kept with the ban)." };
  const { error } = await supabase.rpc("admin_set_ban", { target: userId, days, reason: reason.trim().slice(0, 500) });
  if (!error) return {};
  return { error: /Admins can't/.test(error.message) ? "Function admins can't be banned here." : /yourself/.test(error.message) ? "You can't ban yourself." : "Couldn't save it. Try again." };
}

export async function adminLiftBan(supabase: SupabaseClient, userId: string): Promise<Result> {
  const { error } = await supabase.rpc("admin_lift_ban", { target: userId });
  return error ? { error: "Couldn't lift it. Try again." } : {};
}

// "Suspended until Fri 30 Oct" or "Banned".
export function banLabel(ban: Pick<AccountBan, "until"> | null, now = Date.now()): string | null {
  if (!ban) return null;
  if (!ban.until) return "Banned";
  if (new Date(ban.until).getTime() <= now) return null;
  return `Suspended until ${new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" }).format(new Date(ban.until))}`;
}
