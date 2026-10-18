import type { Metadata } from "next";
import { getMapEvents } from "@/lib/map-events";
import { LiveMap } from "./live-map";

export const metadata: Metadata = {
  title: "Live map",
  description: "Everything on at LSE right now, on one live map.",
};

export default async function MapPage({ searchParams }: PageProps<"/map">) {
  const { events, windows } = await getMapEvents();
  // ?look=day or ?look=night previews that style; otherwise it follows sunset.
  const { look } = await searchParams;
  return <LiveMap events={events} windows={windows} forceLook={look === "day" || look === "night" ? look : undefined} />;
}
