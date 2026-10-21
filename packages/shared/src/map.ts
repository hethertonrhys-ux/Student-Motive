// The live map's shared logic: the map style (light and dark), category
// colours and icons, which events show for Now / Tonight / Tomorrow, and
// walking directions. Pure TypeScript: the website and the app each draw
// it with their own map library.

import type { MapCategory } from "./map-categories";
import { distanceMetres } from "./map-style";

// "day" is the light map, "night" the dark one (the app follows the phone's light or dark mode).
export type Look = "day" | "night";

// ---- Colours and icons -------------------------------------------------

// Each category has its own colour AND its own icon (a 24px path), so pins
// can be told apart without relying on colour.
export const CATEGORY_STYLE: Record<MapCategory, { colour: string; icon: string }> = {
  social: { colour: "#DB2777", icon: "M9 11a3 3 0 100-6 3 3 0 000 6zM3.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5M17 11.4a2.4 2.4 0 100-4.8 2.4 2.4 0 000 4.8zM16.5 14.4c2.6.3 4.5 2.5 4.5 5.6" },
  nightlife: { colour: "#7C3AED", icon: "M9 18V6l10-2v12M9 18a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM19 16a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" },
  careers: { colour: "#0369A1", icon: "M5.5 7.5h13a2.5 2.5 0 012.5 2.5v7.5a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 17.5V10a2.5 2.5 0 012.5-2.5zM8.5 7.5v-2a2 2 0 012-2h3a2 2 0 012 2v2M3 13h18" },
  sport: { colour: "#15803D", icon: "M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17zM12 8.2l3.4 2.5-1.3 4h-4.2l-1.3-4zM12 3.5v4.7M15.4 10.7l4.4-1.6M14.1 14.7l2.7 3.8M9.9 14.7l-2.7 3.8M8.6 10.7L4.2 9.1" },
  arts: { colour: "#C2410C", icon: "M12 3.5a8.5 8.5 0 100 17c.9 0 1.4-.7 1.4-1.5 0-.4-.2-.8-.4-1-.3-.3-.4-.6-.4-1 0-.8.7-1.4 1.4-1.4H16a4.5 4.5 0 004.5-4.5c0-4-3.8-7.6-8.5-7.6zM7.8 12a1 1 0 100-2 1 1 0 000 2zM10.5 8.6a1 1 0 100-2 1 1 0 000 2zM14.8 9a1 1 0 100-2 1 1 0 000 2z" },
  talks: { colour: "#BE123C", icon: "M12 3a3 3 0 013 3v5a3 3 0 01-6 0V6a3 3 0 013-3zM5.5 11a6.5 6.5 0 0013 0M12 17.5V21M9 21h6" },
  study: { colour: "#0F766E", icon: "M12 6.5C10.3 5.3 7.9 4.8 5 4.8v13c2.9 0 5.3.5 7 1.7 1.7-1.2 4.1-1.7 7-1.7v-13c-2.9 0-5.3.5-7 1.7zM12 6.5v13" },
  food: { colour: "#B45309", icon: "M7 3.5v6.5M4.5 3.5v4a2.5 2.5 0 005 0v-4M7 10v10.5M17 20.5V3.5c-2.2 0-3.5 2.4-3.5 6v3.5H17" },
  learn: { colour: "#CA8A04", icon: "M9.5 18h5M10 21h4M12 3a6 6 0 00-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0012 3z" },
  other: { colour: "#475569", icon: "M12 3.5l2.2 5.3 5.8.5-4.4 3.8 1.3 5.6L12 15.8l-4.9 2.9 1.3-5.6L4 9.3l5.8-.5z" },
};
export const CATEGORY_ORDER = Object.keys(CATEGORY_STYLE) as MapCategory[];

// ---- Which events show --------------------------------------------------

export type MapWindows = { now: string; tonightEnds: string; tomorrowEnds: string };
export type When = "now" | "tonight" | "tomorrow";
export const WHEN_OPTIONS: { value: When; label: string }[] = [
  { value: "now", label: "Now" },
  { value: "tonight", label: "Tonight" },
  { value: "tomorrow", label: "Tomorrow" },
];
export const SOON_MS = 60 * 60 * 1000;

type Timed = { startsAt: string; endsAt: string };

export function eventStatus(event: Timed, now: number): "live" | "soon" | "later" {
  const start = new Date(event.startsAt).getTime();
  const end = new Date(event.endsAt).getTime();
  if (start <= now && now < end) return "live";
  if (start > now && start - now <= SOON_MS) return "soon";
  return "later";
}

export function inWindow(event: Timed, when: When, windows: MapWindows, now: number) {
  const start = new Date(event.startsAt).getTime();
  const end = new Date(event.endsAt).getTime();
  const tonightEnds = new Date(windows.tonightEnds).getTime();
  const tomorrowEnds = new Date(windows.tomorrowEnds).getTime();
  if (end <= now) return false;
  if (when === "now") return start - now <= SOON_MS;
  if (when === "tonight") return start < tonightEnds;
  return start >= tonightEnds && start < tomorrowEnds;
}

// Lower case, no accents or punctuation, so "kings" finds "King's".
export const normalise = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Zoomed in at a campus. The map is flat (2D), like Snap Map.
export const campusView = (centre: [number, number]) => ({ center: centre, zoom: 16.2, pitch: 0 });
export const LONDON_VIEW = { center: [-0.145, 51.512] as [number, number], zoom: 11.6, pitch: 0 };

export const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// ---- The map style ------------------------------------------------------

// Function's own map style, drawn from OpenFreeMap's free map data: flat and
// quiet, in neutral greys (Apple's own greys in dark mode), so the event
// pins are the colourful thing on the map. Only the colours and which
// labels show are ours.
const PALETTES = {
  day: {
    land: "#F4F4F2", park: "#DCEBD3", water: "#BCDDF3", waterText: "#4A7398",
    road: "#FFFFFF", roadCase: "#E2E2DF", major: "#FFFFFF", majorCase: "#D6D6D2", path: "#D9D9D5", pedestrian: "#EEEEEB", rail: "#D0D0CC",
    building: "#E7E7E4", buildingEdge: "#DADAD6", campus: "#EFEFEC",
    text: "#6E6E73", textStrong: "#3A3A3C", halo: "#F4F4F2", station: "#6E6E73", place: "#8E8E93", parkText: "#4E7A47",
  },
  night: {
    land: "#1C1C1E", park: "#1E2A20", water: "#11202D", waterText: "#7E9DB8",
    road: "#3A3A3C", roadCase: "#2C2C2E", major: "#48484A", majorCase: "#3A3A3C", path: "#38383A", pedestrian: "#242426", rail: "#3A3A3C",
    building: "#2A2A2D", buildingEdge: "#232326", campus: "#222224",
    text: "#98989F", textStrong: "#D1D1D6", halo: "#1C1C1E", station: "#98989F", place: "#8E8E93", parkText: "#7FA886",
  },
} as const;

// The map's background colour, for behind the map while it loads.
export const mapLand = (look: Look) => PALETTES[look].land;

const REGULAR = ["Noto Sans Regular"];
const BOLD = ["Noto Sans Bold"];
const ITALIC = ["Noto Sans Italic"];
const width = (stops: [number, number][]) => ["interpolate", ["exponential", 1.5], ["zoom"], ...stops.flat()];
const MAJOR = ["motorway", "trunk", "primary"];
const MEDIUM = ["secondary", "tertiary"];
const MINOR = ["minor", "service", "track"];
const notTunnel = ["!=", ["get", "brunnel"], "tunnel"];
const lineClass = (classes: string[]) => ["all", ["==", ["geometry-type"], "LineString"], ["in", ["get", "class"], ["literal", classes]], notTunnel];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapStyle(look: Look, tiles = "https://tiles.openfreemap.org/planet"): any {
  const p = PALETTES[look];
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      omt: { type: "vector", url: tiles, attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
    },
    layers: [
      { id: "land", type: "background", paint: { "background-color": p.land } },
      { id: "green", type: "fill", source: "omt", "source-layer": "landcover", filter: ["in", ["get", "class"], ["literal", ["grass", "wood"]]], paint: { "fill-color": p.park } },
      { id: "park", type: "fill", source: "omt", "source-layer": "park", paint: { "fill-color": p.park } },
      { id: "pitch", type: "fill", source: "omt", "source-layer": "landuse", filter: ["in", ["get", "class"], ["literal", ["pitch", "playground"]]], paint: { "fill-color": p.park } },
      { id: "campus", type: "fill", source: "omt", "source-layer": "landuse", filter: ["in", ["get", "class"], ["literal", ["university", "college"]]], paint: { "fill-color": p.campus } },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": p.water } },
      { id: "waterway", type: "line", source: "omt", "source-layer": "waterway", paint: { "line-color": p.water, "line-width": width([[12, 1], [18, 6]]) } },
      { id: "pedestrian-area", type: "fill", source: "omt", "source-layer": "transportation", filter: ["==", ["geometry-type"], "Polygon"], minzoom: 14, paint: { "fill-color": p.pedestrian } },
      { id: "minor-case", type: "line", source: "omt", "source-layer": "transportation", filter: lineClass(MINOR), minzoom: 13, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.roadCase, "line-width": width([[13, 1.5], [16, 6], [19, 22]]) } },
      { id: "medium-case", type: "line", source: "omt", "source-layer": "transportation", filter: lineClass(MEDIUM), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.roadCase, "line-width": width([[10, 0.8], [13, 2.5], [16, 10], [19, 30]]) } },
      { id: "major-case", type: "line", source: "omt", "source-layer": "transportation", filter: lineClass(MAJOR), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.majorCase, "line-width": width([[8, 1], [12, 2.5], [16, 13], [19, 36]]) } },
      { id: "path", type: "line", source: "omt", "source-layer": "transportation", filter: lineClass(["path"]), minzoom: 15, paint: { "line-color": p.path, "line-width": width([[15, 1], [19, 3]]), "line-dasharray": [2, 1.5] } },
      { id: "rail", type: "line", source: "omt", "source-layer": "transportation", filter: lineClass(["rail", "transit"]), minzoom: 12, paint: { "line-color": p.rail, "line-width": width([[12, 1], [18, 3]]) } },
      { id: "minor", type: "line", source: "omt", "source-layer": "transportation", filter: lineClass(MINOR), minzoom: 13, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.road, "line-width": width([[13, 1], [16, 4.5], [19, 19]]) } },
      { id: "medium", type: "line", source: "omt", "source-layer": "transportation", filter: lineClass(MEDIUM), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.road, "line-width": width([[10, 0.5], [13, 1.5], [16, 8], [19, 26]]) } },
      { id: "major", type: "line", source: "omt", "source-layer": "transportation", filter: lineClass(MAJOR), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.major, "line-width": width([[8, 0.6], [12, 1.6], [16, 10.5], [19, 32]]) } },
      // Buildings are flat shapes, the same neutral grey everywhere.
      { id: "building", type: "fill", source: "omt", "source-layer": "building", minzoom: 14, paint: { "fill-color": p.building, "fill-outline-color": p.buildingEdge } },
      { id: "water-name", type: "symbol", source: "omt", "source-layer": "water_name", filter: ["==", ["geometry-type"], "Point"], layout: { "text-field": ["get", "name:latin"], "text-font": ITALIC, "text-size": 13 }, paint: { "text-color": p.waterText, "text-halo-color": p.water, "text-halo-width": 1 } },
      { id: "water-name-line", type: "symbol", source: "omt", "source-layer": "water_name", filter: ["==", ["geometry-type"], "LineString"], layout: { "text-field": ["get", "name:latin"], "text-font": ITALIC, "text-size": 13, "symbol-placement": "line" }, paint: { "text-color": p.waterText, "text-halo-color": p.water, "text-halo-width": 1 } },
      { id: "waterway-name", type: "symbol", source: "omt", "source-layer": "waterway", minzoom: 13, layout: { "text-field": ["get", "name:latin"], "text-font": ITALIC, "text-size": 13, "symbol-placement": "line", "text-letter-spacing": 0.1 }, paint: { "text-color": p.waterText, "text-halo-color": p.water, "text-halo-width": 1 } },
      { id: "path-name", type: "symbol", source: "omt", "source-layer": "transportation_name", minzoom: 16.5, filter: ["==", ["get", "class"], "path"], layout: { "text-field": ["get", "name:latin"], "text-font": REGULAR, "text-size": 11, "symbol-placement": "line" }, paint: { "text-color": p.text, "text-halo-color": p.halo, "text-halo-width": 1.5 } },
      { id: "road-name", type: "symbol", source: "omt", "source-layer": "transportation_name", minzoom: 14, filter: ["in", ["get", "class"], ["literal", [...MAJOR, ...MEDIUM, "minor"]]], layout: { "text-field": ["get", "name:latin"], "text-font": REGULAR, "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10, 18, 13], "symbol-placement": "line", "text-letter-spacing": 0.02 }, paint: { "text-color": p.text, "text-halo-color": p.halo, "text-halo-width": 1.6 } },
      { id: "park-name", type: "symbol", source: "omt", "source-layer": "park", minzoom: 14, filter: ["==", ["geometry-type"], "Point"], layout: { "text-field": ["get", "name:latin"], "text-font": ITALIC, "text-size": 12, "text-max-width": 8 }, paint: { "text-color": p.parkText, "text-halo-color": p.halo, "text-halo-width": 1.5 } },
      {
        id: "landmark", type: "symbol", source: "omt", "source-layer": "poi", minzoom: 15,
        filter: ["any", ["in", ["get", "class"], ["literal", ["college", "theatre", "museum", "attraction", "town_hall"]]], ["==", ["get", "subclass"], "library"]],
        layout: { "text-field": ["get", "name:latin"], "text-font": ITALIC, "text-size": 11.5, "text-max-width": 9, "symbol-sort-key": ["get", "rank"] },
        paint: { "text-color": p.textStrong, "text-halo-color": p.halo, "text-halo-width": 1.6 },
      },
      {
        id: "station", type: "symbol", source: "omt", "source-layer": "poi", minzoom: 13,
        filter: ["all", ["==", ["get", "class"], "railway"], ["==", ["get", "subclass"], "station"]],
        layout: { "text-field": ["get", "name:latin"], "text-font": BOLD, "text-size": 12 },
        paint: { "text-color": p.station, "text-halo-color": p.halo, "text-halo-width": 1.6 },
      },
      {
        id: "area-name", type: "symbol", source: "omt", "source-layer": "place", minzoom: 11, maxzoom: 16,
        filter: ["in", ["get", "class"], ["literal", ["suburb", "quarter", "neighbourhood"]]],
        layout: { "text-field": ["get", "name:latin"], "text-font": BOLD, "text-size": 11, "text-transform": "uppercase", "text-letter-spacing": 0.15, "text-max-width": 7 },
        paint: { "text-color": p.place, "text-halo-color": p.halo, "text-halo-width": 1.5 },
      },
      {
        id: "city-name", type: "symbol", source: "omt", "source-layer": "place", maxzoom: 12,
        filter: ["in", ["get", "class"], ["literal", ["city", "town"]]],
        layout: { "text-field": ["get", "name:latin"], "text-font": BOLD, "text-size": 15 },
        paint: { "text-color": p.textStrong, "text-halo-color": p.halo, "text-halo-width": 2 },
      },
    ],
  };
}

// Colours for the "busy area" shading (a heatmap) when zoomed out, from
// quiet to busy: a faint wash of Function red, no glow.
export function heatColours(look: Look) {
  const strength = look === "day" ? 1 : 1.3;
  return ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(218,41,28,0)", 0.3, `rgba(218,41,28,${0.1 * strength})`, 1, `rgba(218,41,28,${0.24 * strength})`];
}

// Is it dark in London? Uses the standard sunrise/sunset formula.
export function isDark(at: Date, lat = 51.51, lng = -0.12) {
  const rad = Math.PI / 180;
  const day = Math.floor((Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()) - Date.UTC(at.getUTCFullYear(), 0, 0)) / 86_400_000);
  const g = ((2 * Math.PI) / 365) * (day - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl)) / rad;
  const sunrise = 720 - 4 * (lng + ha) - eqTime;
  const sunset = 720 - 4 * (lng - ha) - eqTime;
  const minutes = at.getUTCHours() * 60 + at.getUTCMinutes();
  return minutes < sunrise || minutes >= sunset;
}

// ---- Walking directions -------------------------------------------------

// Walking routes from the free OpenStreetMap routing service run by FOSSGIS
// (no account or API key). If it can't be reached, a straight line with an
// estimated time is used instead.
const ROUTE_URL = "https://routing.openstreetmap.de/routed-foot/route/v1/driving";

export type Walk = { minutes: number; metres: number; line: [number, number][]; estimate: boolean };

export async function walkingRoute(from: [number, number], to: [number, number]): Promise<Walk> {
  try {
    const res = await fetch(`${ROUTE_URL}/${from.join(",")};${to.join(",")}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(8000) });
    const route = res.ok ? (await res.json()).routes?.[0] : null;
    if (!route?.geometry?.coordinates?.length) throw new Error("No route");
    return { minutes: Math.max(1, Math.round(route.duration / 60)), metres: route.distance, line: route.geometry.coordinates, estimate: false };
  } catch {
    const metres = distanceMetres(from, to) * 1.3;
    return { minutes: Math.max(1, Math.round(metres / 80)), metres, line: [from, to], estimate: true };
  }
}

export function walkText(walk: Walk) {
  const distance = walk.metres < 1000 ? `${Math.round(walk.metres / 10) * 10} m` : `${(walk.metres / 1000).toFixed(1)} km`;
  return `${walk.estimate ? "About " : ""}${walk.minutes} min walk · ${distance}`;
}

// Google Maps walking directions, for turn-by-turn on the phone.
export function mapsLink(to: [number, number]) {
  return `https://www.google.com/maps/dir/?api=1&destination=${to[1]},${to[0]}&travelmode=walking`;
}

export function walkGeoJson(walk: Walk | null) {
  return {
    type: "FeatureCollection" as const,
    features: walk
      ? [
          { type: "Feature" as const, properties: { kind: "line" }, geometry: { type: "LineString" as const, coordinates: walk.line } },
          { type: "Feature" as const, properties: { kind: "start" }, geometry: { type: "Point" as const, coordinates: walk.line[0] } },
        ]
      : [],
  };
}
