// The live map's shared logic: the map style (day and night), category
// colours and icons, which events show for Now / Tonight / Tomorrow, and
// walking directions. Pure TypeScript: the website and the app each draw
// it with their own map library.

import type { MapCategory } from "./map-categories";
import { distanceMetres } from "./map-style";

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

// Zoomed in at a campus, the map tilts slightly so buildings look 3D.
export const campusView = (centre: [number, number]) => ({ center: centre, zoom: 16.2, pitch: 35 });
export const LONDON_VIEW = { center: [-0.145, 51.512] as [number, number], zoom: 11.6, pitch: 0 };

export const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// ---- The map style ------------------------------------------------------

// Function's own map style ("Clear Day"), drawn from OpenFreeMap's free map
// data. Only the colours and which labels show are ours.
const PALETTES = {
  day: {
    land: "#F7F6F2", park: "#CDEBC4", water: "#A8D8FF", waterText: "#3B6E9E",
    road: "#FFFFFF", roadCase: "#E2DED5", major: "#FFF0B3", majorCase: "#EFD37A", path: "#D9D5CC", pedestrian: "#F1EEE6", rail: "#C9C5BD",
    building: "#ECE9E2", buildingSide: "#DAD5CA", campus: "#FFF0EF", lse: "#FFC9C5", lseSide: "#F5A39D",
    text: "#5A5E68", textStrong: "#2F333B", halo: "#F7F6F2", lseText: "#DA291C", station: "#B4233C", place: "#8A8E98",
  },
  night: {
    land: "#171C27", park: "#1B3226", water: "#0E2036", waterText: "#7FA6CC",
    road: "#2A3241", roadCase: "#1D2330", major: "#3F4658", majorCase: "#2C3242", path: "#323A4A", pedestrian: "#1E2430", rail: "#3A4150",
    building: "#232A38", buildingSide: "#12161F", campus: "#2A1D22", lse: "#6B2A2A", lseSide: "#4A1C1C",
    text: "#AEB6C4", textStrong: "#DDE3EE", halo: "#171C27", lseText: "#FF8A80", station: "#FF8FA3", place: "#7D8596",
  },
} as const;

const REGULAR = ["Noto Sans Regular"];
const BOLD = ["Noto Sans Bold"];
const ITALIC = ["Noto Sans Italic"];
const width = (stops: [number, number][]) => ["interpolate", ["exponential", 1.5], ["zoom"], ...stops.flat()];
const MAJOR = ["motorway", "trunk", "primary"];
const MEDIUM = ["secondary", "tertiary"];
const MINOR = ["minor", "service", "track"];
const notTunnel = ["!=", ["get", "brunnel"], "tunnel"];
const lineClass = (classes: string[]) => ["all", ["==", ["geometry-type"], "LineString"], ["in", ["get", "class"], ["literal", classes]], notTunnel];
const isCampusBuilding = ["==", ["get", "kind"], "building"];

// campus: where the LSE building outlines come from (a URL, or the GeoJSON itself).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapStyle(look: Look, campus: string | object, tiles = "https://tiles.openfreemap.org/planet"): any {
  const p = PALETTES[look];
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      lse: { type: "geojson", data: campus },
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
      { id: "building", type: "fill", source: "omt", "source-layer": "building", minzoom: 13, maxzoom: 15.5, paint: { "fill-color": p.building, "fill-outline-color": p.buildingSide } },
      { id: "lse-building", type: "fill", source: "lse", filter: isCampusBuilding, minzoom: 13, maxzoom: 15.5, paint: { "fill-color": p.lse, "fill-outline-color": p.lseSide } },
      {
        id: "building-3d", type: "fill-extrusion", source: "omt", "source-layer": "building", minzoom: 15,
        paint: {
          "fill-extrusion-color": p.building,
          "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 15, 0, 16, ["coalesce", ["get", "render_height"], 6]],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 15, 0, 15.5, 0.92],
          "fill-extrusion-vertical-gradient": true,
        },
      },
      {
        id: "lse-building-3d", type: "fill-extrusion", source: "lse", filter: isCampusBuilding, minzoom: 15,
        paint: {
          "fill-extrusion-color": p.lse,
          "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 15, 0, 16, ["get", "height"]],
          "fill-extrusion-base": ["get", "base"],
          "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 15, 0, 15.5, 0.92],
          "fill-extrusion-vertical-gradient": true,
        },
      },
      { id: "water-name", type: "symbol", source: "omt", "source-layer": "water_name", filter: ["==", ["geometry-type"], "Point"], layout: { "text-field": ["get", "name:latin"], "text-font": ITALIC, "text-size": 13 }, paint: { "text-color": p.waterText, "text-halo-color": p.water, "text-halo-width": 1 } },
      { id: "water-name-line", type: "symbol", source: "omt", "source-layer": "water_name", filter: ["==", ["geometry-type"], "LineString"], layout: { "text-field": ["get", "name:latin"], "text-font": ITALIC, "text-size": 13, "symbol-placement": "line" }, paint: { "text-color": p.waterText, "text-halo-color": p.water, "text-halo-width": 1 } },
      { id: "waterway-name", type: "symbol", source: "omt", "source-layer": "waterway", minzoom: 13, layout: { "text-field": ["get", "name:latin"], "text-font": ITALIC, "text-size": 13, "symbol-placement": "line", "text-letter-spacing": 0.1 }, paint: { "text-color": p.waterText, "text-halo-color": p.water, "text-halo-width": 1 } },
      { id: "path-name", type: "symbol", source: "omt", "source-layer": "transportation_name", minzoom: 16.5, filter: ["==", ["get", "class"], "path"], layout: { "text-field": ["get", "name:latin"], "text-font": REGULAR, "text-size": 11, "symbol-placement": "line" }, paint: { "text-color": p.text, "text-halo-color": p.halo, "text-halo-width": 1.5 } },
      { id: "road-name", type: "symbol", source: "omt", "source-layer": "transportation_name", minzoom: 14, filter: ["in", ["get", "class"], ["literal", [...MAJOR, ...MEDIUM, "minor"]]], layout: { "text-field": ["get", "name:latin"], "text-font": REGULAR, "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10, 18, 13], "symbol-placement": "line", "text-letter-spacing": 0.02 }, paint: { "text-color": p.text, "text-halo-color": p.halo, "text-halo-width": 1.6 } },
      { id: "park-name", type: "symbol", source: "omt", "source-layer": "park", minzoom: 14, filter: ["==", ["geometry-type"], "Point"], layout: { "text-field": ["get", "name:latin"], "text-font": ITALIC, "text-size": 12, "text-max-width": 8 }, paint: { "text-color": look === "day" ? "#3F7A3A" : "#8CCB95", "text-halo-color": p.halo, "text-halo-width": 1.5 } },
      {
        id: "landmark", type: "symbol", source: "omt", "source-layer": "poi", minzoom: 15,
        filter: ["any", ["in", ["get", "class"], ["literal", ["college", "theatre", "museum", "attraction", "town_hall"]]], ["==", ["get", "subclass"], "library"]],
        layout: { "text-field": ["get", "name:latin"], "text-font": ITALIC, "text-size": 11.5, "text-max-width": 9, "symbol-sort-key": ["get", "rank"] },
        paint: { "text-color": p.textStrong, "text-halo-color": p.halo, "text-halo-width": 1.6 },
      },
      {
        id: "lse-name", type: "symbol", source: "lse", minzoom: 15.5,
        filter: ["all", ["==", ["get", "kind"], "label"], ["<=", ["get", "rank"], ["step", ["zoom"], 1, 16.3, 2, 16.8, 3, 17.3, 4]]],
        layout: { "text-field": ["get", "name"], "text-font": BOLD, "text-size": ["interpolate", ["linear"], ["zoom"], 15.5, 11, 18, 13], "text-max-width": 7, "symbol-sort-key": ["get", "rank"] },
        paint: { "text-color": p.lseText, "text-halo-color": p.halo, "text-halo-width": 1.8 },
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

// Colours for the "busy area" glow (a heatmap), from quiet to busy.
export function heatColours(look: Look) {
  const strength = look === "day" ? 1 : 1.4;
  return ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(249,115,22,0)", 0.2, `rgba(251,146,60,${0.3 * strength})`, 0.55, `rgba(249,115,22,${0.45 * strength})`, 1, `rgba(244,63,94,${0.55 * strength})`];
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
