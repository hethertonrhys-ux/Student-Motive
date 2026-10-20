import type { SupabaseClient } from "@supabase/supabase-js";
import { featureDef, type FeatureKey } from "./features";

// Feature requests and Founding Society progress (Part 4 of the Society
// Hub). A committee asks for a feature from its Hub; the Function team
// works through the requests in the admin panel and tells the committee
// when it's live. A Founding Society's progress (events posted since
// agreeing, the prize draw, the badge) is worked out from its events, never
// stored. The database checks everything here
// (supabase/migrations/20261120000000_feature_requests_founding.sql).

type Result = { error?: string };

// ---- Founding Society progress ----
//
// The rules (the database's founding_status() follows the same ones; keep
// the two in step):
//   - A "published event" isn't cancelled, hidden by the Function team, or a
//     draft.
//   - "Events posted since agreeing": published events created at or after
//     the agreement.
//   - "In the prize draw": at least the target (3) of those, each with at
//     least one person going.
//   - "Last event": the newest published event (any time).
//   - "Badge on": a Founding Society that has agreed, whose last event or
//     agreement (whichever is later) is less than 30 days old. It turns off
//     after 30 days without a new event, and back on when they post again.

export const FOUNDING_BADGE_DAYS = 30;
export const FOUNDING_NUDGE_DAYS = 7;
export const DEFAULT_EVENTS_TARGET = 3;

const DAY = 24 * 3600 * 1000;

export type FoundingEvent = {
  createdAt: string | number | Date;
  cancelled: boolean;
  hidden: boolean;
  draft?: boolean;
  // How many people are going.
  going: number;
};

export type FoundingProgress = {
  isFounding: boolean;
  agreedAt: string | null;
  eventsTarget: number;
  eventsSince: number;
  eventsWithRsvp: number;
  lastEventAt: string | null;
  daysSinceLastEvent: number | null;
  eligible: boolean;
  badgeActive: boolean;
  // Events still needed (with someone going) for the prize draw; never negative.
  toGo: number;
};

const time = (t: string | number | Date) => new Date(t).getTime();

// A society's Founding progress from its events.
export function foundingProgress({
  isFounding,
  agreedAt,
  eventsTarget = DEFAULT_EVENTS_TARGET,
  events,
  now = Date.now(),
}: {
  isFounding: boolean;
  agreedAt: string | number | Date | null;
  eventsTarget?: number;
  events: FoundingEvent[];
  now?: string | number | Date;
}): FoundingProgress {
  const nowMs = time(now);
  const agreed = agreedAt == null ? null : time(agreedAt);
  const published = events.filter((e) => !e.cancelled && !e.hidden && !e.draft);
  const since = agreed == null ? [] : published.filter((e) => time(e.createdAt) >= agreed);
  const eventsSince = since.length;
  const eventsWithRsvp = since.filter((e) => e.going > 0).length;
  const last = published.length ? Math.max(...published.map((e) => time(e.createdAt))) : null;
  const latest = Math.max(last ?? -Infinity, agreed ?? -Infinity);
  const agreedOk = isFounding && agreed != null;
  return {
    isFounding,
    agreedAt: agreed == null ? null : new Date(agreed).toISOString(),
    eventsTarget,
    eventsSince,
    eventsWithRsvp,
    lastEventAt: last == null ? null : new Date(last).toISOString(),
    daysSinceLastEvent: last == null ? null : Math.floor((nowMs - last) / DAY),
    eligible: agreedOk && eventsWithRsvp >= eventsTarget,
    badgeActive: agreedOk && latest > nowMs - FOUNDING_BADGE_DAYS * DAY,
    toGo: Math.max(0, eventsTarget - eventsWithRsvp),
  };
}

// One line for the Hub's progress card, e.g. "2 of 3 events posted, 1 to go
// for the prize draw". Events beyond the target show as the target ("3 of
// 3"). An event only counts for the prize draw once someone's going, which
// the line says when that's what is holding them back.
export function foundingProgressLine(p: Pick<FoundingProgress, "agreedAt" | "eventsTarget" | "eventsSince" | "eventsWithRsvp" | "eligible" | "toGo">): string {
  if (!p.agreedAt) return "Agree to the Founding Society terms to start counting your events.";
  const posted = `${Math.min(p.eventsSince, p.eventsTarget)} of ${p.eventsTarget} events posted`;
  if (p.eligible) return `${posted}. You're in the prize draw.`;
  const toGo = `${p.toGo} to go for the prize draw`;
  if (p.eventsWithRsvp < p.eventsSince) return `${posted}, ${toGo}. An event counts once someone's going.`;
  return `${posted}, ${toGo}`;
}

// "Last event 3 days ago" for the progress card and the admin list.
export function lastEventText(days: number | null): string {
  if (days == null) return "No events yet";
  if (days <= 0) return "Last event today";
  if (days === 1) return "Last event yesterday";
  return `Last event ${days} days ago`;
}

type ProgressRow = {
  is_founding: boolean;
  agreed_at: string | null;
  events_target: number;
  events_since: number;
  events_with_rsvp: number;
  last_event_at: string | null;
  days_since_last_event: number | null;
  eligible: boolean;
  badge_active: boolean;
};

const fromRow = (r: ProgressRow): FoundingProgress => ({
  isFounding: r.is_founding === true,
  agreedAt: r.agreed_at ?? null,
  eventsTarget: r.events_target ?? DEFAULT_EVENTS_TARGET,
  eventsSince: r.events_since ?? 0,
  eventsWithRsvp: r.events_with_rsvp ?? 0,
  lastEventAt: r.last_event_at ?? null,
  daysSinceLastEvent: r.days_since_last_event ?? null,
  eligible: r.eligible === true,
  badgeActive: r.badge_active === true,
  toGo: Math.max(0, (r.events_target ?? DEFAULT_EVENTS_TARGET) - (r.events_with_rsvp ?? 0)),
});

// The Hub's progress card: only the society's managers (and Function
// admins) get it; null for anyone else. Throws if it can't be loaded.
export async function loadFoundingProgress(supabase: SupabaseClient, societyId: string): Promise<FoundingProgress | null> {
  const { data, error } = await supabase.rpc("founding_progress", { sid: societyId });
  if (error) throw error;
  const row = ((data ?? []) as ProgressRow[])[0];
  return row ? fromRow(row) : null;
}

// Whether a society's page shows the Founding Society badge (anyone may
// ask). Throws if it can't be loaded.
export async function foundingBadgeActive(supabase: SupabaseClient, societyId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("founding_badge_active", { sid: societyId });
  if (error) throw error;
  return data === true;
}

// ---- The Function team's lists (admins only; the database refuses anyone else) ----

export type AdminFoundingRow = FoundingProgress & { societyId: string; name: string; slug: string; university: string };

// Every Founding Society (agreed or not) with its progress. Throws on error.
export async function loadAdminFounding(supabase: SupabaseClient): Promise<AdminFoundingRow[]> {
  const { data, error } = await supabase.rpc("admin_founding_societies");
  if (error) throw error;
  type Row = ProgressRow & { society_id: string; name: string; slug: string; university: string };
  return ((data ?? []) as Row[]).map((r) => ({ ...fromRow({ ...r, is_founding: true }), societyId: r.society_id, name: r.name, slug: r.slug, university: r.university }));
}

export type WantedFeature = { key: string; name: string; societies: number; societyNames: string[] };

// The features societies have said "We want this" to, most wanted first,
// with their names from the registry. Throws on error.
export async function loadFeatureInterestRanking(supabase: SupabaseClient): Promise<WantedFeature[]> {
  const { data, error } = await supabase.rpc("admin_feature_interest");
  if (error) throw error;
  return ((data ?? []) as { feature_key: string; societies: number; society_names: string[] | null }[]).map((r) => ({
    key: r.feature_key,
    name: featureDef(r.feature_key as FeatureKey)?.name ?? r.feature_key,
    societies: r.societies,
    societyNames: r.society_names ?? [],
  }));
}

// ---- Feature requests ----

export type FeatureRequestStatus = "new" | "building" | "live" | "declined";

export const FEATURE_REQUEST_STATUSES: { value: FeatureRequestStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "building", label: "Building" },
  { value: "live", label: "Live" },
  { value: "declined", label: "Declined" },
];

export const isFeatureRequestStatus = (value: unknown): value is FeatureRequestStatus => FEATURE_REQUEST_STATUSES.some((s) => s.value === value);

export const featureRequestStatusLabel = (status: string) => FEATURE_REQUEST_STATUSES.find((s) => s.value === status)?.label ?? status;

export const REQUEST_NEED_MIN = 3;
export const REQUEST_TEXT_MAX = 1000;

export type FeatureRequest = {
  id: string;
  society_id: string;
  need: string;
  current_process: string | null;
  status: FeatureRequestStatus;
  admin_note: string | null;
  created_at: string;
  status_changed_at: string | null;
};

// What the committee typed, checked the same way as the database does.
export function checkFeatureRequest(need: string, currentProcess: string | null | undefined): { need: string; currentProcess: string | null } | { error: string } {
  const n = need.trim();
  const now = (currentProcess ?? "").trim();
  if (n.length < REQUEST_NEED_MIN) return { error: "Tell us what you need (a few words is enough)." };
  if (n.length > REQUEST_TEXT_MAX) return { error: `Keep it under ${REQUEST_TEXT_MAX} characters.` };
  if (now.length > REQUEST_TEXT_MAX) return { error: `Keep "How do you do it now?" under ${REQUEST_TEXT_MAX} characters.` };
  return { need: n, currentProcess: now || null };
}

// A committee asks for a feature for their society.
export async function submitFeatureRequest(supabase: SupabaseClient, societyId: string, need: string, currentProcess?: string | null): Promise<Result> {
  const checked = checkFeatureRequest(need, currentProcess);
  if ("error" in checked) return { error: checked.error };
  const { error } = await supabase.from("feature_requests").insert({ society_id: societyId, need: checked.need, current_process: checked.currentProcess });
  return error ? { error: "Couldn't send it. Try again." } : {};
}

// The society's requests, newest first. Throws if they can't be loaded.
export async function loadSocietyFeatureRequests(supabase: SupabaseClient, societyId: string): Promise<FeatureRequest[]> {
  const { data, error } = await supabase
    .from("feature_requests")
    .select("id, society_id, need, current_process, status, admin_note, created_at, status_changed_at")
    .eq("society_id", societyId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as FeatureRequest[];
}

export type AdminFeatureRequest = FeatureRequest & { society_name: string; society_slug: string; university: string; requested_by_name: string | null };

// Every society's requests for the Function team, newest first, optionally
// one status only. Throws on error.
export async function loadAdminFeatureRequests(supabase: SupabaseClient, status?: FeatureRequestStatus | null): Promise<AdminFeatureRequest[]> {
  const { data, error } = await supabase.rpc("admin_feature_requests", { status_filter: status ?? null });
  if (error) throw error;
  return (data ?? []) as AdminFeatureRequest[];
}

// Function admins: change a request's status (setting it to live tells the
// society's managers), and the note the committee sees with it. Leave the
// note out to keep it as it is; an empty note clears it.
export async function setFeatureRequestStatus(supabase: SupabaseClient, id: string, status: FeatureRequestStatus, note?: string | null): Promise<Result> {
  if (!isFeatureRequestStatus(status)) return { error: "Pick a status." };
  const patch: { status: FeatureRequestStatus; admin_note?: string | null } = { status };
  if (note !== undefined) {
    const n = (note ?? "").trim();
    if (n.length > REQUEST_TEXT_MAX) return { error: `Keep the note under ${REQUEST_TEXT_MAX} characters.` };
    patch.admin_note = n || null;
  }
  const { data, error } = await supabase.from("feature_requests").update(patch).eq("id", id).select("id");
  // No row back: not allowed (only Function admins can), or it's gone.
  if (error || !data || data.length !== 1) return { error: "Couldn't save. Try again." };
  return {};
}
