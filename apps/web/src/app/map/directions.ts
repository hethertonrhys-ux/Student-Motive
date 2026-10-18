import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { distanceMetres } from "@/lib/map-style";

// Walking routes from the free OpenStreetMap routing service run by FOSSGIS
// (no account or API key). If it can't be reached, we fall back to a straight
// line with an estimated time, and the "Open in Maps" link still works.
const ROUTE_URL = "https://routing.openstreetmap.de/routed-foot/route/v1/driving";

export type Walk = { minutes: number; metres: number; line: [number, number][]; estimate: boolean };

export async function walkingRoute(from: [number, number], to: [number, number]): Promise<Walk> {
  try {
    const res = await fetch(`${ROUTE_URL}/${from.join(",")};${to.join(",")}?overview=full&geometries=geojson`, {
      signal: AbortSignal.timeout(8000),
    });
    const route = res.ok ? (await res.json()).routes?.[0] : null;
    if (!route?.geometry?.coordinates?.length) throw new Error("No route");
    return {
      minutes: Math.max(1, Math.round(route.duration / 60)),
      metres: route.distance,
      line: route.geometry.coordinates,
      estimate: false,
    };
  } catch {
    // Streets are roughly 1.3x the straight line, at about 80 m a minute.
    const metres = distanceMetres(from, to) * 1.3;
    return { minutes: Math.max(1, Math.round(metres / 80)), metres, line: [from, to], estimate: true };
  }
}

export function walkText(walk: Walk) {
  const distance = walk.metres < 1000 ? `${Math.round(walk.metres / 10) * 10} m` : `${(walk.metres / 1000).toFixed(1)} km`;
  return `${walk.estimate ? "About " : ""}${walk.minutes} min walk · ${distance}`;
}

// Google Maps walking directions, for turn-by-turn on the phone. A plain
// link: free, and Google finds the starting point itself.
export function mapsLink(to: [number, number]) {
  return `https://www.google.com/maps/dir/?api=1&destination=${to[1]},${to[0]}&travelmode=walking`;
}

// Where you are, asked for only when you tap Directions.
export function whereAmI(): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser can't share your location."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([p.coords.longitude, p.coords.latitude]),
      (e) =>
        reject(
          new Error(
            e.code === 1
              ? "Location is turned off for Function. Allow it in your phone's settings to get directions."
              : "Couldn't find your location. Try again outside or near a window.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}

// The route on the map: a white-edged line, dotted when it's only an
// estimate, with a dot where you are.
export function drawWalk(map: MapLibreMap, walk: Walk) {
  const line: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: walk.line } },
      { type: "Feature", properties: { start: true }, geometry: { type: "Point", coordinates: walk.line[0] } },
    ],
  };
  const source = map.getSource("walk") as GeoJSONSource | undefined;
  if (source) source.setData(line);
  else {
    map.addSource("walk", { type: "geojson", data: line });
    const lines = ["==", ["geometry-type"], "LineString"] as ["==", ["geometry-type"], string];
    map.addLayer({ id: "walk-edge", type: "line", source: "walk", filter: lines, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 8 } });
    map.addLayer({ id: "walk-line", type: "line", source: "walk", filter: lines, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#4338ca", "line-width": 5 } });
    map.addLayer({
      id: "walk-start",
      type: "circle",
      source: "walk",
      filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-radius": 7, "circle-color": "#2563eb", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 },
    });
  }
  map.setPaintProperty("walk-line", "line-dasharray", walk.estimate ? [1, 2] : [1, 0]);
  const lngs = walk.line.map((p) => p[0]);
  const lats = walk.line.map((p) => p[1]);
  map.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    // Room for the buttons at the top and the route bar at the bottom.
    { padding: { top: 100, bottom: 190, left: 50, right: 70 }, maxZoom: 17, pitch: 0 },
  );
}

export function clearWalk(map: MapLibreMap) {
  (map.getSource("walk") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
}
