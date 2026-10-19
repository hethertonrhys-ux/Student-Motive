import type { Ref } from "react";
import type { Look, MapEvent, Walk } from "@function/shared";
import type { MapCategory } from "@function/shared";

// The one Map component, drawn by maplibre-gl on the web and by MapLibre
// Native on iOS and Android (Map.web.tsx / Map.native.tsx). It only draws:
// the map, the pins and groups, the busy-area glow, your blue dot and the
// walking route. Everything you tap on around it (the time pills, filters,
// search, the event card) is ordinary React Native in the map screen.

export type MapTarget = { center: [number, number]; zoom: number; pitch?: number };

export type MapHandle = {
  flyTo(target: MapTarget): void;
  // Zoom out so the whole walking route is in view, with room for the bars.
  fitWalk(walk: Walk): void;
};

export type MapProps = {
  // The events to draw (already filtered by time, category and search).
  events: MapEvent[];
  now: number;
  look: Look;
  home: [number, number];
  // Your location once you've shared it, as [longitude, latitude].
  me: [number, number] | null;
  walk: Walk | null;
  // A pin tapped: one event. A group that can't split (all in one place): several.
  onSelect: (events: MapEvent[]) => void;
  onReady?: () => void;
  onError?: () => void;
  ref?: Ref<MapHandle>;
};

// Icons for pins on the phone (Ionicons), one per category, matching the
// website's own icons in spirit: people, music, a briefcase, a ball...
export const PIN_ICON: Record<MapCategory, string> = {
  social: "people",
  nightlife: "musical-notes",
  careers: "briefcase",
  sport: "football",
  arts: "color-palette",
  talks: "mic",
  study: "book",
  food: "restaurant",
  learn: "bulb",
  other: "star",
};

export const WALK_COLOUR = "#DA291C";
export const ME_COLOUR = "#2563eb";
