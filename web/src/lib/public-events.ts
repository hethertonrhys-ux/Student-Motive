import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { MotiveEvent, Society, Venue } from "@/lib/types";

export type EventWithDetails = MotiveEvent & {
  societies: Pick<Society, "name" | "slug" | "logo_url" | "university"> | null;
  venues: Pick<Venue, "name" | "address" | "lat" | "lng"> | null;
  event_tables: { started_at: string | null }[] | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// cache() means the page and its metadata share one database call.
export const getPublicEvent = cache(async (id: string): Promise<EventWithDetails | null> => {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("*, societies(name, slug, logo_url, university), venues(name, address, lat, lng), event_tables(started_at)")
    .eq("id", id)
    .maybeSingle();
  return data as EventWithDetails | null;
});
