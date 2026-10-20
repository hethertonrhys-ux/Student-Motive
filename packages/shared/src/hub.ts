import type { SupabaseClient } from "@supabase/supabase-js";
import { FEATURES, hasFeature, loadSocietyFeatures, type FeatureKey, type FeatureSubject, type SocietyType } from "./features";
import { formatEventTime } from "./time";
import type { Society } from "./types";

// The Society Hub: where a committee runs their society on Function, and
// the setup wizard they go through after claiming it (check the page, pick
// a type and features, the Founding Society agreement, add the committee,
// post the first event, share it). The database checks every change (see
// supabase/migrations/20261119000000_society_hub.sql): only the society's
// managers, or Function admins, can change anything here.

type Result = { error?: string };

// ---- The setup wizard ----

export type HubStep = "welcome" | "page" | "type" | "features" | "founding" | "committee" | "event" | "live";

const ALL_STEPS: HubStep[] = ["welcome", "page", "type", "features", "founding", "committee", "event", "live"];

// A short name for each step (the wide-screen sidebar lists them).
export const HUB_STEP_LABELS: Record<HubStep, string> = {
  welcome: "Welcome",
  page: "Check your page",
  type: "Society type",
  features: "Features",
  founding: "Founding Society",
  committee: "Your committee",
  event: "First event",
  live: "You're live",
};

// The wizard's steps, in order. The Founding Society agreement only shows
// for a society the Function team has marked as Founding.
export function hubSteps({ isFounding }: { isFounding: boolean }): HubStep[] {
  return ALL_STEPS.filter((s) => s !== "founding" || isFounding);
}

export const isHubStep = (value: unknown): value is HubStep => typeof value === "string" && (ALL_STEPS as string[]).includes(value);

// The step after (or before) this one; null at either end.
export function nextHubStep(steps: HubStep[], current: HubStep): HubStep | null {
  const i = steps.indexOf(current);
  return i >= 0 && i < steps.length - 1 ? steps[i + 1] : null;
}
export function previousHubStep(steps: HubStep[], current: HubStep): HubStep | null {
  const i = steps.indexOf(current);
  return i > 0 ? steps[i - 1] : null;
}

// ---- The Founding Society agreement (shown exactly as written) ----

export const FOUNDING_FUNCTION_COMMITS = [
  "Building one feature around how you run within 24 hours of your request",
  "A Founding Society badge and an Instagram Collab post",
  "Entry into the prize draw for your next social",
  "Free for societies, always",
];

export const FOUNDING_SOCIETY_COMMITS = [
  'Putting your next 3 events on Function, with "RSVP on Function" and the link in the caption and story',
  "Adding the Function link to your Instagram bio for launch week",
  "Posting a story and a Collab post on launch day",
];

export const FOUNDING_STAY_ACTIVE = "The badge, prize draw entry and 24-hour builds stay active while you keep posting events. Either side can stop at any time.";

// ---- Links and sharing ----

const site = (siteUrl: string) => siteUrl.replace(/\/+$/, "");

// The society's public page, e.g. for the Instagram bio.
export const societyLink = (siteUrl: string, slug: string) => `${site(siteUrl)}/s/${slug}`;

// An event's page.
export const eventLink = (siteUrl: string, eventId: string) => `${site(siteUrl)}/e/${eventId}`;

// Opens WhatsApp with the text ready to send to a chat of your choice.
export const whatsappShareUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

export type StoryEvent = { id: string; title: string; starts_at: string; ends_at: string; place?: string | null };
export type StorySociety = { name: string; slug: string };
export type StoryLineKind = "society" | "title" | "when" | "place" | "cta" | "link";
export type StoryLine = { kind: StoryLineKind; text: string };

// The words on the story card (shown on screen to screenshot, and drawn
// into the downloadable image): the society, the event, its day and time,
// where, "RSVP on Function" and the link. Without an event, the society's
// page instead.
export function storyLines(event: StoryEvent | null, society: StorySociety, siteUrl: string): StoryLine[] {
  const lines: StoryLine[] = [{ kind: "society", text: society.name.trim() }];
  if (event) {
    lines.push({ kind: "title", text: event.title.trim() });
    lines.push({ kind: "when", text: formatEventTime(event.starts_at, event.ends_at) });
    const place = event.place?.trim();
    if (place) lines.push({ kind: "place", text: place });
  } else {
    lines.push({ kind: "title", text: "We're on Function" });
  }
  lines.push({ kind: "cta", text: "RSVP on Function" });
  lines.push({ kind: "link", text: (event ? eventLink(siteUrl, event.id) : societyLink(siteUrl, society.slug)).replace(/^https?:\/\//, "") });
  return lines;
}

// The message for WhatsApp: the event and its link, or the society's page.
export function whatsappText(event: StoryEvent | null, society: StorySociety, siteUrl: string): string {
  if (event) return `${event.title.trim()} (${society.name.trim()}), ${formatEventTime(event.starts_at, event.ends_at)}. RSVP on Function: ${eventLink(siteUrl, event.id)}`;
  return `${society.name.trim()} is on Function. See what's on and RSVP: ${societyLink(siteUrl, society.slug)}`;
}

// ---- Loading a society for the Hub ----

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HubSocietyRow = Society & { is_founding: boolean; onboarded_at: string | null };
export type FoundingAgreement = { society_id: string; agreed_by: string | null; agreed_at: string; events_target: number };
export type HubSociety = {
  society: HubSocietyRow;
  features: FeatureSubject;
  agreement: FoundingAgreement | null;
  // A manager of the society (a Function admin who isn't one can still open the Hub).
  isCommittee: boolean;
};

// The society, if you can manage it (its managers and Function admins);
// null if you can't or it doesn't exist (or the id in the link is
// malformed). Throws if it can't be loaded.
export async function loadHubSociety(supabase: SupabaseClient, societyId: string): Promise<HubSociety | null> {
  if (!UUID.test(societyId)) return null;
  const [society, allowed, committee, features, agreement] = await Promise.all([
    supabase.from("societies").select("*").eq("id", societyId).maybeSingle<HubSocietyRow>(),
    supabase.rpc("is_society_admin", { sid: societyId }),
    supabase.rpc("is_society_committee", { sid: societyId }),
    loadSocietyFeatures(supabase, societyId),
    supabase.from("founding_agreements").select("society_id, agreed_by, agreed_at, events_target").eq("society_id", societyId).maybeSingle<FoundingAgreement>(),
  ]);
  if (society.error) throw society.error;
  if (allowed.error) throw allowed.error;
  if (!society.data || allowed.data !== true) return null;
  return {
    society: { ...society.data, is_founding: society.data.is_founding === true, onboarded_at: society.data.onboarded_at ?? null },
    features,
    agreement: agreement.data ?? null,
    isCommittee: committee.data === true,
  };
}

// The societies you manage, by name. Throws if they can't be loaded.
export async function loadMyHubSocieties(supabase: SupabaseClient, myId: string): Promise<HubSocietyRow[]> {
  const { data, error } = await supabase.from("society_admins").select("societies(*)").eq("user_id", myId);
  if (error) throw error;
  return ((data ?? []) as unknown as { societies: HubSocietyRow | null }[])
    .map((r) => r.societies)
    .filter((s): s is HubSocietyRow => !!s)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// How many societies you manage (for the Me tab's "Society Hub" row).
export async function countMyManagedSocieties(supabase: SupabaseClient, myId: string): Promise<number> {
  const { count, error } = await supabase.from("society_admins").select("society_id", { count: "exact", head: true }).eq("user_id", myId);
  if (error) throw error;
  return count ?? 0;
}

// Event admin (the SU paperwork) is only set up for LSE so far; other unis
// see "Event admin isn't available for your uni yet". Part 5's rules engine
// (one config per uni) takes this over.
export const eventAdminAvailable = (university: string) => university === "LSE";

// How many live features a society has on.
export const featuresOnCount = (subject: FeatureSubject) => FEATURES.filter((f) => f.status === "live" && hasFeature(subject, f.key)).length;

// What a society that hasn't chosen any features sees ticked (its type's
// defaults, or everything from before features if it has no type), as
// rows to save so that what's shown is what's saved.
export function pretickedFeatures(subject: FeatureSubject): Partial<Record<FeatureKey, boolean>> {
  return Object.fromEntries(FEATURES.filter((f) => f.status === "live").map((f) => [f.key, hasFeature({ ...subject, features: null }, f.key)]));
}

// ---- Changing the society ----

export async function setSocietyType(supabase: SupabaseClient, societyId: string, type: SocietyType): Promise<Result> {
  const { error } = await supabase.from("societies").update({ society_type: type }).eq("id", societyId);
  return error ? { error: "Couldn't save. Please try again." } : {};
}

// The committee has been through the setup. Only the first time counts.
export async function finishOnboarding(supabase: SupabaseClient, societyId: string): Promise<Result> {
  const { error } = await supabase.from("societies").update({ onboarded_at: new Date().toISOString() }).eq("id", societyId).is("onboarded_at", null);
  return error ? { error: "Couldn't save. Please try again." } : {};
}

// Function admins only (the database ignores anyone else): make a society
// a Founding Society, or stop it being one.
export async function setSocietyFounding(supabase: SupabaseClient, societyId: string, founding: boolean): Promise<Result> {
  const { data, error } = await supabase.from("societies").update({ is_founding: founding }).eq("id", societyId).select("is_founding").maybeSingle<{ is_founding: boolean }>();
  if (error || !data || data.is_founding !== founding) return { error: "Couldn't save. Please try again." };
  return {};
}

// "We're in": the society agrees to be a Founding Society.
export async function agreeToFounding(supabase: SupabaseClient, societyId: string): Promise<Result> {
  const { error } = await supabase.rpc("agree_to_founding", { sid: societyId });
  if (!error) return {};
  return { error: error.message?.includes("isn't a Founding Society") ? "This society isn't a Founding Society." : "Couldn't save. Please try again." };
}

// ---- "We want this" for coming-soon features ----

export async function loadFeatureInterest(supabase: SupabaseClient, societyId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("feature_interest").select("feature_key").eq("society_id", societyId);
  if (error) throw error;
  return new Set(((data ?? []) as { feature_key: string }[]).map((r) => r.feature_key));
}

export async function setFeatureInterest(supabase: SupabaseClient, societyId: string, key: FeatureKey, wanted: boolean): Promise<Result> {
  const { error } = wanted
    ? await supabase.from("feature_interest").insert({ society_id: societyId, feature_key: key })
    : await supabase.from("feature_interest").delete().eq("society_id", societyId).eq("feature_key", key);
  // Already wanted (e.g. a second tap that crossed in the post): fine.
  if (error && !(wanted && error.code === "23505")) return { error: "Couldn't save. Please try again." };
  return {};
}

// ---- The committee (managers) ----

export type Manager = { user_id: string; name: string; avatar_url: string | null; is_me: boolean; added_at: string };

// Who manages the society: names and photos, never emails.
export async function loadManagers(supabase: SupabaseClient, societyId: string): Promise<Manager[]> {
  const { data, error } = await supabase.rpc("society_managers", { sid: societyId });
  if (error) throw error;
  return (data ?? []) as Manager[];
}

export type ManagerInvite = { email: string; created_at: string };

// Emails the committee has invited who haven't signed up yet.
export async function loadManagerInvites(supabase: SupabaseClient, societyId: string): Promise<ManagerInvite[]> {
  const { data, error } = await supabase.from("society_manager_invites").select("email, created_at").eq("society_id", societyId).order("created_at");
  if (error) throw error;
  return (data ?? []) as ManagerInvite[];
}

export async function cancelManagerInvite(supabase: SupabaseClient, societyId: string, email: string): Promise<Result> {
  const { error } = await supabase.from("society_manager_invites").delete().eq("society_id", societyId).eq("email", email);
  return error ? { error: "Couldn't cancel it. Try again." } : {};
}

// Someone who has blocked you, or whom you've blocked, can't be added.
const BLOCKED_MESSAGE = "You can't add this person.";
const blocked = (error: { message?: string }) => !!error.message?.includes("You can't add this person");

// Add someone (found by name) as a manager. They get a Society Hub push.
export async function addManager(supabase: SupabaseClient, societyId: string, personId: string): Promise<Result> {
  const { error } = await supabase.rpc("add_society_manager", { sid: societyId, person: personId });
  if (!error) return {};
  return { error: blocked(error) ? BLOCKED_MESSAGE : "Couldn't add them. Try again." };
}

export const MANAGER_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Add someone by email: straight away if they have an account ("added"),
// otherwise as soon as they sign up ("invited"). Only emails that can sign
// up (a London uni email, or one the Function team has allowed) are invited.
export async function inviteManager(supabase: SupabaseClient, societyId: string, email: string): Promise<{ result?: "added" | "invited"; error?: string }> {
  const address = email.trim().toLowerCase();
  if (!MANAGER_EMAIL.test(address) || address.length > 254) return { error: "That doesn't look like an email address." };
  const { data, error } = await supabase.rpc("invite_society_manager", { sid: societyId, address });
  if (error) {
    if (error.message?.includes("doesn't look like an email")) return { error: "That doesn't look like an email address." };
    if (error.message?.includes("Use their uni email")) return { error: "Use their uni email: only uni students can sign up." };
    if (blocked(error)) return { error: BLOCKED_MESSAGE };
    return { error: "Couldn't add them. Try again." };
  }
  if (data !== "added" && data !== "invited") return { error: "Couldn't add them. Try again." };
  return { result: data };
}

export const LAST_MANAGER_MESSAGE = "You're the last manager. Add someone else first, then remove yourself.";

// Stop being a manager (the committee handover). Refused for the last one.
export async function leaveManagement(supabase: SupabaseClient, societyId: string): Promise<Result> {
  const { error } = await supabase.rpc("leave_society_management", { sid: societyId });
  if (!error) return {};
  return { error: error.message?.includes("the last manager") ? LAST_MANAGER_MESSAGE : "Couldn't remove you. Try again." };
}
