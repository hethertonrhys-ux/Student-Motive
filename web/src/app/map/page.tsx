import type { Metadata } from "next";
import { getMapEvents } from "@/lib/map-events";
import { LiveMap } from "./live-map";
import { getProfile } from "@/lib/auth";
import { DEFAULT_UNI, uniById } from "@/lib/universities";

export const metadata: Metadata = {
  title: "Live map",
  description: "What's on across London's universities right now, on one live map.",
};

export default async function MapPage({ searchParams }: PageProps<"/map">) {
  const [{ events, windows }, me] = await Promise.all([getMapEvents(), getProfile()]);
  const uni = uniById(me?.university) ?? uniById(DEFAULT_UNI)!;
  // ?look=day or ?look=night previews that style; otherwise it follows sunset.
  const { look } = await searchParams;
  return <LiveMap events={events} windows={windows} home={{ short: uni.short, centre: uni.centre }} forceLook={look === "day" || look === "night" ? look : undefined} />;
}
