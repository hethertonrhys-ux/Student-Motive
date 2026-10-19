import type { SupabaseClient } from "@supabase/supabase-js";
import { SHOW_EVENT_COUNT_FROM, SHOW_SOCIETY_COUNT_FROM, uniShort, type UniId } from "./universities";

// What the welcome screen shows someone from this uni: a few of its
// societies to follow, how many there are (only once there are enough to
// be worth saying), and what's coming up: their uni's events first, then
// events open to all London students and socials, so it's never empty.

export type SuggestedSociety = { id: string; name: string; slug: string; logo_url: string | null };
export type Upcoming = { id: string; title: string; starts_at: string; ends_at: string; href: string; by: string };
export type Welcome = { societies: SuggestedSociety[]; counts: string[]; upcoming: Upcoming[] };

type EventRow = { id: string; title: string; starts_at: string; ends_at: string; societies: { name: string; university: string } };
type SocialRow = { id: string; title: string; starts_at: string; ends_at: string; area: string };

export async function loadWelcome(supabase: SupabaseClient, uni: UniId, now = new Date().toISOString()): Promise<Welcome> {
  const eventFields = "id, title, starts_at, ends_at, societies!inner(name, university)";
  const [societies, societyCount, ownEvents, eventCount, londonEvents, socials] = await Promise.all([
    supabase.from("societies").select("id, name, slug, logo_url").eq("university", uni).eq("kind", "society").order("is_verified", { ascending: false }).order("name").limit(8),
    supabase.from("societies").select("id", { count: "exact", head: true }).eq("university", uni).eq("kind", "society"),
    supabase.from("events").select(eventFields).eq("societies.university", uni).eq("is_cancelled", false).gt("ends_at", now).order("starts_at").limit(4),
    supabase.from("events").select("id, societies!inner(university)", { count: "exact", head: true }).eq("societies.university", uni).eq("is_cancelled", false).gt("ends_at", now),
    supabase.from("events").select(eventFields).eq("audience", "london").neq("societies.university", uni).eq("is_cancelled", false).gt("ends_at", now).order("starts_at").limit(4),
    supabase.from("social_events").select("id, title, starts_at, ends_at, area").eq("is_cancelled", false).eq("friends_only", false).gt("ends_at", now).order("starts_at").limit(4),
  ]);

  const own: Upcoming[] = ((ownEvents.data ?? []) as unknown as EventRow[]).map((e) => ({ ...e, href: `/e/${e.id}`, by: e.societies.name }));
  const open: Upcoming[] = [
    ...((londonEvents.data ?? []) as unknown as EventRow[]).map((e) => ({ ...e, href: `/e/${e.id}`, by: `${e.societies.name} · ${uniShort(e.societies.university)}` })),
    ...((socials.data ?? []) as SocialRow[]).map((e) => ({ ...e, href: `/social/${e.id}`, by: `Social · ${e.area}` })),
  ].sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return {
    societies: (societies.data ?? []) as SuggestedSociety[],
    counts: [
      (societyCount.count ?? 0) >= SHOW_SOCIETY_COUNT_FROM ? `${societyCount.count} societies` : null,
      (eventCount.count ?? 0) >= SHOW_EVENT_COUNT_FROM ? `${eventCount.count} events coming up` : null,
    ].filter((c): c is string => c !== null),
    upcoming: [...own, ...open].slice(0, 5),
  };
}
