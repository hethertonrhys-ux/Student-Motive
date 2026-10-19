import type { SupabaseClient } from "@supabase/supabase-js";
import { getFriendships } from "./social";

// Two tick boxes that work the same everywhere events are listed (the map,
// event search and Recommended): "Only events my friends are hosting" and
// "Only events from societies I'm a member of". Both ticked = either one.

export type PersonalFilters = { friendsHosting: boolean; mySocieties: boolean };
export const NO_PERSONAL_FILTERS: PersonalFilters = { friendsHosting: false, mySocieties: false };

export const PERSONAL_FILTER_OPTIONS: { key: keyof PersonalFilters; label: string }[] = [
  { key: "friendsHosting", label: "Only events my friends are hosting" },
  { key: "mySocieties", label: "Only events from societies I'm a member of" },
];

// Who the logged-in person is connected to: accepted friends, and the
// societies they're an approved member of or run.
export type FilterContext = { friendIds: Set<string>; societyIds: Set<string> };
export const EMPTY_FILTER_CONTEXT: FilterContext = { friendIds: new Set(), societyIds: new Set() };

// The bits of an event the filters look at. Society events have a societyId;
// student-hosted events and Social plans have a hostId.
export type FilterableEvent = { hostId: string | null; societyId: string | null };

// A short stable string for query keys, so a cached list is dropped when your friends or societies change.
export function filterContextKey(who: FilterContext): string {
  let hash = 2166136261;
  for (const ch of [...who.friendIds].sort().join(",") + "|" + [...who.societyIds].sort().join(",")) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return `${who.friendIds.size}-${who.societyIds.size}-${(hash >>> 0).toString(36)}`;
}

export const personalFilterCount = (f: PersonalFilters) => Number(f.friendsHosting) + Number(f.mySocieties);
export const isPersonalFiltering = (f: PersonalFilters) => personalFilterCount(f) > 0;

export function matchesPersonalFilters(e: FilterableEvent, who: FilterContext, f: PersonalFilters): boolean {
  if (!f.friendsHosting && !f.mySocieties) return true;
  if (f.friendsHosting && e.hostId && who.friendIds.has(e.hostId)) return true;
  if (f.mySocieties && e.societyId && who.societyIds.has(e.societyId)) return true;
  return false;
}

export async function loadFilterContext(supabase: SupabaseClient, myId: string | null): Promise<FilterContext> {
  if (!myId) return EMPTY_FILTER_CONTEXT;
  const [relations, { data: members }, { data: admins }] = await Promise.all([
    getFriendships(supabase, myId),
    supabase.from("society_members").select("society_id").eq("user_id", myId).eq("status", "approved"),
    supabase.from("society_admins").select("society_id").eq("user_id", myId),
  ]);
  const friendIds = new Set([...relations.entries()].filter(([, r]) => r === "friends").map(([id]) => id));
  const societyIds = new Set([...(members ?? []), ...(admins ?? [])].map((r) => r.society_id as string));
  return { friendIds, societyIds };
}
