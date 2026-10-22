import "server-only";
import { createClient } from "@/lib/supabase/server";
import { nightEnds, nowMs } from "@/lib/time";
import type { EventCategory } from "@/lib/types";
import { getCards } from "@/lib/social";
import { socialToMapCategory, type MapCategory } from "@/lib/map-categories";
import type { SocialCategory } from "@/lib/social-events";

// One pin on the map.
export type MapEvent = {
  id: string;
  title: string;
  category: MapCategory;
  freeFood: boolean;
  startsAt: string;
  endsAt: string;
  going: number;
  lat: number;
  lng: number;
  place: string;
  society: string;
  // Where the pin's card links to: a society event or a Social event.
  href: string;
};

export type MapWindows = {
  now: string;
  tonightEnds: string; // 6am after tonight
  tomorrowEnds: string; // 6am after tomorrow night
};

type Row = {
  id: string;
  title: string;
  category: EventCategory;
  free_food: boolean;
  starts_at: string;
  ends_at: string;
  going_count: number;
  lat: number | null;
  lng: number | null;
  location_note: string | null;
  venues: { name: string; lat: number; lng: number } | null;
  societies: { name: string } | null;
  host_user_id: string | null;
  visibility: "public" | "friends";
  event_tables: { started_at: string | null }[] | null;
};

type SocialRow = {
  id: string;
  title: string;
  category: SocialCategory;
  starts_at: string;
  ends_at: string;
  going_count: number;
  lat: number;
  lng: number;
  area: string;
  host_id: string;
  friends_only: boolean;
};

// Everything that's on from now until the end of tomorrow night.
export async function getMapEvents(): Promise<{ events: MapEvent[]; windows: MapWindows }> {
  const now = nowMs();
  const windows: MapWindows = {
    now: new Date(now).toISOString(),
    tonightEnds: nightEnds(now),
    tomorrowEnds: nightEnds(now, 1),
  };

  const supabase = await createClient();
  // Social events load at the same time as society events (below).
  const socialQuery = supabase
    .from("social_events")
    .select("id, title, category, starts_at, ends_at, going_count, lat, lng, area, host_id, friends_only")
    .eq("is_cancelled", false)
    .gt("ends_at", windows.now)
    .lt("starts_at", windows.tomorrowEnds)
    .order("starts_at")
    .limit(500);
  const eventsQuery = supabase
    .from("events")
    .select("id, title, category, free_food, starts_at, ends_at, going_count, lat, lng, location_note, venues(name, lat, lng), societies(name), host_user_id, visibility, event_tables(started_at)")
    .eq("is_cancelled", false)
    .gt("ends_at", windows.now)
    .lt("starts_at", windows.tomorrowEnds)
    .order("starts_at")
    .limit(500);
  const [{ data }, { data: socialData }] = await Promise.all([eventsQuery, socialQuery]);

  const rows = (data ?? []) as unknown as Row[];
  const socialRows = (socialData ?? []) as SocialRow[];
  const hosts = await getCards(supabase, [...rows.map((r) => r.host_user_id).filter((x): x is string => !!x), ...socialRows.map((r) => r.host_id)]);
  const events: MapEvent[] = [];
  for (const row of rows) {
    const lat = row.lat ?? row.venues?.lat;
    const lng = row.lng ?? row.venues?.lng;
    if (lat == null || lng == null) continue;
    events.push({
      id: row.id,
      title: row.title,
      category: row.category,
      freeFood: row.free_food,
      // A table the committee started early makes the event live early.
      startsAt: [row.starts_at, ...(row.event_tables ?? []).map((t) => t.started_at).filter((x): x is string => !!x)].sort()[0],
      endsAt: row.ends_at,
      going: row.going_count,
      lat,
      lng,
      place: [row.venues?.name, row.location_note].filter(Boolean).join(" · "),
      society:
        row.societies?.name ??
        (row.host_user_id
          ? `Hosted by ${hosts.get(row.host_user_id)?.name ?? "a student"}${row.visibility === "friends" ? " · Friends only" : ""}`
          : ""),
      href: `/e/${row.id}`,
    });
  }
  // Social events hosted by students. The database only returns the ones you
  // may see (friends-only events just for the host's friends).
  for (const row of socialRows) {
    events.push({
      id: row.id,
      title: row.title,
      category: socialToMapCategory(row.category),
      freeFood: false,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      going: row.going_count + 1, // the host counts as going
      lat: row.lat,
      lng: row.lng,
      place: row.area,
      society: `Hosted by ${hosts.get(row.host_id)?.name ?? "a student"}${row.friends_only ? " · Friends only" : ""}`,
      href: `/social/${row.id}`,
    });
  }
  events.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { events, windows };
}
