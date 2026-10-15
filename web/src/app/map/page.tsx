import type { Metadata } from "next";
import { getMapEvents } from "@/lib/map-events";
import { LiveMap } from "./live-map";

export const metadata: Metadata = {
  title: "Live map",
  description: "Everything on at LSE right now, on one live map.",
};

export default async function MapPage() {
  const { events, windows } = await getMapEvents();
  return <LiveMap events={events} windows={windows} />;
}
