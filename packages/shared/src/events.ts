import type { SupabaseClient } from "@supabase/supabase-js";
import type { MapCategory } from "./map-categories";
import { socialToMapCategory } from "./map-categories";
import { getCards } from "./social";
import type { SocialCategory } from "./social-events";
import { nextLondonSixAm } from "./time";
import type { MotiveEvent, Society, Venue } from "./types";
import { uniShort } from "./universities";

// What's on: society events (the database only returns the ones you may
// see: your uni's, open-to-all-London ones, and your societies' members-only
// ones) plus students' socials, in the next two weeks, grouped Tonight /
// Tomorrow / Later. The same rows the map uses, without needing a pin.

export type FeedItem = {
  id: string;
  title: string;
  category: MapCategory;
  freeFood: boolean;
  startsAt: string;
  endsAt: string;
  going: number;
  place: string;
  // Who it's by: the society (with its uni when it isn't yours) or the host.
  by: string;
  href: string;
  imageUrl: string | null;
};
export type FeedGroup = { key: "tonight" | "tomorrow" | "later"; title: string; items: FeedItem[] };

type EventRow = {
  id: string; title: string; category: MotiveEvent["category"]; free_food: boolean; starts_at: string; ends_at: string; going_count: number;
  location_note: string | null; image_url: string | null; venues: { name: string } | null;
  societies: { name: string; university: string } | null; host_user_id: string | null; visibility: "public" | "friends";
  event_tables: { started_at: string | null }[] | null;
};
type SocialRow = { id: string; title: string; category: SocialCategory; starts_at: string; ends_at: string; going_count: number; area: string; host_id: string; friends_only: boolean };

export async function loadFeed(supabase: SupabaseClient, myUni: string | null, now = Date.now(), days = 14): Promise<FeedGroup[]> {
  const from = new Date(now).toISOString();
  const until = new Date(now + days * 86_400_000).toISOString();
  const [{ data }, { data: socialData }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, category, free_food, starts_at, ends_at, going_count, location_note, image_url, venues(name), societies(name, university), host_user_id, visibility, event_tables(started_at)")
      .eq("is_cancelled", false).gt("ends_at", from).lt("starts_at", until).order("starts_at").limit(300),
    supabase
      .from("social_events")
      .select("id, title, category, starts_at, ends_at, going_count, area, host_id, friends_only")
      .eq("is_cancelled", false).gt("ends_at", from).lt("starts_at", until).order("starts_at").limit(300),
  ]);
  const rows = (data ?? []) as unknown as EventRow[];
  const socials = (socialData ?? []) as SocialRow[];
  const hosts = await getCards(supabase, [...rows.map((r) => r.host_user_id).filter((x): x is string => !!x), ...socials.map((r) => r.host_id)]);

  const items: FeedItem[] = [
    ...rows.map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category as MapCategory,
      freeFood: row.free_food,
      // A table the committee started early makes the event live early.
      startsAt: [row.starts_at, ...(row.event_tables ?? []).map((t) => t.started_at).filter((x): x is string => !!x)].sort()[0],
      endsAt: row.ends_at,
      going: row.going_count,
      place: [row.venues?.name, row.location_note].filter(Boolean).join(" · "),
      by: row.societies
        ? row.societies.university === myUni ? row.societies.name : `${row.societies.name} · ${uniShort(row.societies.university)}`
        : `Hosted by ${hosts.get(row.host_user_id ?? "")?.name ?? "a student"}${row.visibility === "friends" ? " · Friends only" : ""}`,
      href: `/e/${row.id}`,
      imageUrl: row.image_url,
    })),
    ...socials.map((row) => ({
      id: row.id,
      title: row.title,
      category: socialToMapCategory(row.category),
      freeFood: false,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      going: row.going_count + 1, // the host counts as going
      place: row.area,
      by: `Hosted by ${hosts.get(row.host_id)?.name ?? "a student"}${row.friends_only ? " · Friends only" : ""}`,
      href: `/social/${row.id}`,
      imageUrl: null,
    })),
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const tonightEnds = nextLondonSixAm(now);
  const tomorrowEnds = nextLondonSixAm(now, 1);
  const groups: FeedGroup[] = [
    { key: "tonight", title: "Tonight", items: items.filter((e) => e.startsAt < tonightEnds) },
    { key: "tomorrow", title: "Tomorrow", items: items.filter((e) => e.startsAt >= tonightEnds && e.startsAt < tomorrowEnds) },
    { key: "later", title: "Coming up", items: items.filter((e) => e.startsAt >= tomorrowEnds) },
  ];
  return groups.filter((g) => g.items.length > 0);
}

// One society event (or student-hosted event) with its society, venue and tables.
export type EventWithDetails = MotiveEvent & {
  societies: Pick<Society, "name" | "slug" | "logo_url" | "university"> | null;
  venues: Pick<Venue, "name" | "address" | "lat" | "lng"> | null;
  event_tables: { started_at: string | null }[] | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadEvent(supabase: SupabaseClient, id: string): Promise<EventWithDetails | null> {
  if (!UUID.test(id)) return null;
  const { data } = await supabase
    .from("events")
    .select("*, societies(name, slug, logo_url, university), venues(name, address, lat, lng), event_tables(started_at)")
    .eq("id", id)
    .maybeSingle();
  return (data as EventWithDetails | null) ?? null;
}
