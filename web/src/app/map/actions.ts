"use server";

import { getMapEvents } from "@/lib/map-events";

// Fresh events for the map's once-a-minute update. Only the event list is
// fetched; the rest of the page (header, bottom bar) isn't reloaded.
export async function loadMapEvents() {
  return getMapEvents();
}
