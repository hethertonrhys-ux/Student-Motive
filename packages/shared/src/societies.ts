import type { SupabaseClient } from "@supabase/supabase-js";
import { withoutDrafts } from "./drafts";
import { promptCount } from "./my-prompts";
import { nowMs } from "./time";
import type { MotiveEvent, OrgKind, Profile, Society } from "./types";

// The Societies tab and society pages, read straight from the database
// (the same queries the website runs on its server).

export type FoundSociety = { id: string; name: string; slug: string; kind: OrgKind; logo_url: string | null; university: string };
// Your link to a society, if any.
export type SocietyRelation = "runs" | "member" | "pending";
export type SocietyLite = Pick<Society, "id" | "name" | "slug" | "logo_url">;
export type UpcomingEntry = { status: string; event: Pick<MotiveEvent, "id" | "title" | "starts_at" | "ends_at" | "society_id"> & { societies: { name: string } | null } };

export const KIND_LABEL: Record<OrgKind, string> = {
  society: "Society",
  hall: "Hall",
  university: "University",
  promoter: "Club night",
};

export type SocietiesTab = {
  // Your own uni's societies (for instant search). Logged out: none.
  all: FoundSociety[];
  runs: SocietyLite[];
  memberships: { status: string; society: SocietyLite }[];
  upcoming: UpcomingEntry[];
  relations: Record<string, SocietyRelation>;
};

export async function loadSocietiesTab(supabase: SupabaseClient, me: Pick<Profile, "id" | "university"> | null): Promise<SocietiesTab> {
  if (!me) return { all: [], runs: [], memberships: [], upcoming: [], relations: {} };
  const [{ data: all }, { data: adminRows }, { data: memberRows }, { data: entryRows }] = await Promise.all([
    supabase.from("societies").select("id, name, slug, kind, logo_url, university").eq("university", me.university).order("name").limit(2000),
    supabase.from("society_admins").select("societies(id, name, slug, logo_url)").eq("user_id", me.id),
    supabase.from("society_members").select("status, societies(id, name, slug, logo_url)").eq("user_id", me.id),
    withoutDrafts(() => supabase.from("event_entries").select("status, events(id, title, starts_at, ends_at, society_id, societies(name))").eq("user_id", me.id), "events.is_draft"),
  ]);
  const runs = ((adminRows ?? []) as unknown as { societies: SocietyLite | null }[])
    .map((r) => r.societies)
    .filter((s): s is SocietyLite => !!s)
    .sort((a, b) => a.name.localeCompare(b.name));
  const memberships = ((memberRows ?? []) as unknown as { status: string; societies: SocietyLite | null }[])
    .filter((m): m is { status: string; societies: SocietyLite } => !!m.societies)
    .map((m) => ({ status: m.status, society: m.societies }));
  const now = nowMs();
  const upcoming = ((entryRows ?? []) as unknown as { status: string; events: UpcomingEntry["event"] | null }[])
    .filter((e): e is { status: string; events: UpcomingEntry["event"] } => !!e.events && !!e.events.society_id && new Date(e.events.ends_at).getTime() > now)
    .map((e) => ({ status: e.status, event: e.events }))
    .sort((a, b) => a.event.starts_at.localeCompare(b.event.starts_at));
  const relations: Record<string, SocietyRelation> = {};
  for (const m of memberships) relations[m.society.id] = m.status === "approved" ? "member" : "pending";
  for (const s of runs) relations[s.id] = "runs";
  return { all: (all ?? []) as FoundSociety[], runs, memberships, upcoming, relations };
}

// Search societies at every London uni (the database does the matching),
// with the searcher's own uni first.
export async function searchAllSocieties(supabase: SupabaseClient, query: string, firstUni: string | null): Promise<FoundSociety[]> {
  const q = query.trim().slice(0, 100);
  if (!q) return [];
  const { data } = await supabase.rpc("search_societies", { q, first_uni: firstUni });
  return (data ?? []) as FoundSociety[];
}

// Count taps on "Search all London unis" (for the Function team).
export async function logSearchAllUnis(supabase: SupabaseClient, university: string, query: string) {
  await supabase.from("search_events").insert({ event: "societies_search_all_unis", university, query: query.trim().slice(0, 100) });
}

// Lower case, no accents or punctuation, so "Fintech" finds "LSE FinTech Society".
const normaliseName = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Your own uni's societies matching what you typed; names that start with it first.
export function searchOwnSocieties(societies: FoundSociety[], query: string): FoundSociety[] {
  const words = normaliseName(query).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  return societies
    .map((s) => ({ s, name: normaliseName(s.name) }))
    .filter(({ name }) => words.every((w) => name.includes(w)))
    .sort((a, b) => Number(b.name.startsWith(words[0])) - Number(a.name.startsWith(words[0])) || a.name.localeCompare(b.name))
    .slice(0, 12)
    .map(({ s }) => s);
}

// ---- One society's page ----

export type SocietyPage = { society: Society; events: MotiveEvent[]; claimed: boolean | null };

export async function loadSociety(supabase: SupabaseClient, slug: string): Promise<SocietyPage | null> {
  const { data: society } = await supabase.from("societies").select("*").eq("slug", slug).maybeSingle<Society>();
  if (!society) return null;
  const [{ data: events }, { data: claimed }] = await Promise.all([
    withoutDrafts(() => supabase.from("events").select("*").eq("society_id", society.id).eq("is_cancelled", false).gte("ends_at", new Date().toISOString()).order("starts_at").limit(30)),
    supabase.rpc("society_is_claimed", { sid: society.id }),
  ]);
  return { society, events: (events ?? []) as MotiveEvent[], claimed: typeof claimed === "boolean" ? claimed : null };
}

export type Membership = { status: "approved" | "pending" | null; isAdmin: boolean; prompts: number };

export async function loadMembership(supabase: SupabaseClient, societyId: string, userId: string): Promise<Membership> {
  const [{ data: membership }, { data: isAdmin }, prompts] = await Promise.all([
    supabase.from("society_members").select("status").eq("society_id", societyId).eq("user_id", userId).maybeSingle<{ status: "approved" | "pending" }>(),
    supabase.rpc("is_society_admin", { sid: societyId }),
    promptCount(supabase, userId),
  ]);
  return { status: membership?.status ?? null, isAdmin: isAdmin === true, prompts };
}

// Asks the committee to approve you. The database checks you're at the society's uni.
export async function requestToJoin(supabase: SupabaseClient, societyId: string, name: string): Promise<{ error?: string }> {
  const yourName = name.trim();
  if (yourName.length < 2) return { error: "Enter the name you'd like members to see." };
  const { error } = await supabase.rpc("request_membership", { sid: societyId, your_name: yourName });
  if (error) return { error: error.message.startsWith("This society is for") ? `${error.message}.` : "Couldn't send your request. Please try again." };
  return {};
}

export async function leaveSociety(supabase: SupabaseClient, societyId: string, userId: string) {
  await supabase.from("society_members").delete().eq("society_id", societyId).eq("user_id", userId);
}
