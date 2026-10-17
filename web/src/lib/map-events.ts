import "server-only";
import { createClient } from "@/lib/supabase/server";
import { nextLondonSixAm, nowMs } from "@/lib/time";
import type { EventCategory } from "@/lib/types";
import { getCards } from "@/lib/social";

// One pin on the map.
export type MapEvent = {
  id: string;
  title: string;
  category: EventCategory;
  freeFood: boolean;
  startsAt: string;
  endsAt: string;
  going: number;
  lat: number;
  lng: number;
  place: string;
  society: string;
};

export type MapWindows = {
  now: string;
  tonightEnds: string; // next 6am
  tomorrowEnds: string; // the 6am after that
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

// Everything that's on from now until the end of tomorrow night.
export async function getMapEvents(): Promise<{ events: MapEvent[]; windows: MapWindows }> {
  const now = nowMs();
  const windows: MapWindows = {
    now: new Date(now).toISOString(),
    tonightEnds: nextLondonSixAm(now),
    tomorrowEnds: nextLondonSixAm(now, 1),
  };

  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, title, category, free_food, starts_at, ends_at, going_count, lat, lng, location_note, venues(name, lat, lng), societies(name), host_user_id, visibility, event_tables(started_at)")
    .eq("is_cancelled", false)
    .gt("ends_at", windows.now)
    .lt("starts_at", windows.tomorrowEnds)
    .order("starts_at")
    .limit(500);

  const rows = (data ?? []) as unknown as Row[];
  const hosts = await getCards(supabase, rows.map((r) => r.host_user_id).filter((x): x is string => !!x));
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
    });
  }
  return { events, windows };
}
