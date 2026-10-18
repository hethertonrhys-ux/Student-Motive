import type { StyleSpecification } from "maplibre-gl";

// Function's own map style ("Clear Day"), drawn from OpenFreeMap's free
// map data. Only the colours and which labels show are ours: every street,
// path and building outline is the real one from the map data.

export type Look = "day" | "night";

const PALETTES = {
  day: {
    land: "#F7F6F2", park: "#CDEBC4", water: "#A8D8FF", waterText: "#3B6E9E",
    road: "#FFFFFF", roadCase: "#E2DED5", major: "#FFF0B3", majorCase: "#EFD37A", path: "#D9D5CC", pedestrian: "#F1EEE6", rail: "#C9C5BD",
    building: "#ECE9E2", buildingSide: "#DAD5CA", campus: "#EEF0FF", lseZone: "#E3E6FF", lse: "#C7CCFF", lseSide: "#A5ADF7",
    text: "#5A5E68", textStrong: "#2F333B", halo: "#F7F6F2", lseText: "#4338CA", station: "#B4233C", place: "#8A8E98",
  },
  night: {
    land: "#171C27", park: "#1B3226", water: "#0E2036", waterText: "#7FA6CC",
    road: "#2A3241", roadCase: "#1D2330", major: "#3F4658", majorCase: "#2C3242", path: "#323A4A", pedestrian: "#1E2430", rail: "#3A4150",
    building: "#232A38", buildingSide: "#12161F", campus: "#1D2036", lseZone: "#22265A", lse: "#30346F", lseSide: "#22255A",
    text: "#AEB6C4", textStrong: "#DDE3EE", halo: "#171C27", lseText: "#A5B4FC", station: "#FF8FA3", place: "#7D8596",
  },
} as const;

// The LSE campus area and its buildings: the real outlines, taken exactly as
// they are from the same map data (public/lse-campus.geojson), so they
// line up perfectly. Only their colour changes.
const CAMPUS_DATA = "/lse-campus.geojson";
const campusUrl = () => (typeof window === "undefined" ? CAMPUS_DATA : new URL(CAMPUS_DATA, window.location.origin).href);
const isCampusBuilding = ["==", ["get", "kind"], "building"];

const REGULAR = ["Noto Sans Regular"];
const BOLD = ["Noto Sans Bold"];
const ITALIC = ["Noto Sans Italic"];

// Line widths that grow as you zoom in.
const width = (stops: [number, number][]) => ["interpolate", ["exponential", 1.5], ["zoom"], ...stops.flat()];
const MAJOR = ["motorway", "trunk", "primary"];
const MEDIUM = ["secondary", "tertiary"];
const MINOR = ["minor", "service", "track"];
const notTunnel = ["!=", ["get", "brunnel"], "tunnel"];
const lineClass = (classes: string[]) => ["all", ["==", ["geometry-type"], "LineString"], ["in", ["get", "class"], ["literal", classes]], notTunnel];

export function mapStyle(look: Look): StyleSpecification {
  const p = PALETTES[look];
  const style = {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      lse: { type: "geojson", data: campusUrl() },
      omt: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
    },
    layers: [
      { id: "land", type: "background", paint: { "background-color": p.land } },
      { id: "green", type: "fill", source: "omt", "source-layer": "landcover", filter: ["in", ["get", "class"], ["literal", ["grass", "wood"]]], paint: { "fill-color": p.park } },
      { id: "park", type: "fill", source: "omt", "source-layer": "park", paint: { "fill-color": p.park } },
      { id: "pitch", type: "fill", source: "omt", "source-layer": "landuse", filter: ["in", ["get", "class"], ["literal", ["pitch", "playground"]]], paint: { "fill-color": p.park } },
      { id: "campus", type: "fill", source: "omt", "source-layer": "landuse", filter: ["in", ["get", "class"], ["literal", ["university", "college"]]], paint: { "fill-color": p.campus } },
      { id: "lse-campus", type: "fill", source: "lse", filter: ["==", ["get", "kind"], "campus"], paint: { "fill-color": p.lseZone } },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": p.water } },
      { id: "waterway", type: "line", source: "omt", "source-layer": "waterway", paint: { "line-color": p.water, "line-width": width([[12, 1], [18, 6]]) } },

      // Pedestrian squares and areas (like LSE Square)
      { id: "pedestrian-area", type: "fill", source: "omt", "source-layer": "transportation", filter: ["==", ["geometry-type"], "Polygon"], minzoom: 14, paint: { "fill-color": p.pedestrian } },

      // Roads: outlines first, then the fill on top
      { id: "minor-case", type: "line", source: "omt", "source-layer": "transportation", filter: lineClass(MINOR), minzoom: 13, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.roadCase, "line-width": width([[13, 1.5], [16, 6], [19, 22]]) } },
      { id: "medium-case", type: "line", source: "omt", "source-layer": "transportation", filter: lineClass(MEDIUM), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.roadCase, "line-width": width([[10, 0.8], [13, 2.5], [16, 10], [19, 30]]) } },
      { id: "major-case", type: "line", source: "omt", "source-layer": "transportation", filter: lineClass(MAJOR), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.majorCase, "line-width": width([[8, 1], [12, 2.5], [16, 13], [19, 36]]) } },
      { id: "path", type: "line", source: "omt", "source-layer": "transportation", filter: lineClass(["path"]), minzoom: 15, paint: { "line-color": p.path, "line-width": width([[15, 1], [19, 3]]), "line-dasharray": [2, 1.5] } },
      { id: "rail", type: "line", source: "omt", "source-layer": "transportation", filter: lineClass(["rail", "transit"]), minzoom: 12, paint: { "line-color": p.rail, "line-width": width([[12, 1], [18, 3]]) } },
      { id: "minor", type: "line", source: "omt", "source-layer": "transportation", filter: lineClass(MINOR), minzoom: 13, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.road, "line-width": width([[13, 1], [16, 4.5], [19, 19]]) } },
      { id: "medium", type: "line", source: "omt", "source-layer": "transportation", filter: lineClass(MEDIUM), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.road, "line-width": width([[10, 0.5], [13, 1.5], [16, 8], [19, 26]]) } },
      { id: "major", type: "line", source: "omt", "source-layer": "transportation", filter: lineClass(MAJOR), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.major, "line-width": width([[8, 0.6], [12, 1.6], [16, 10.5], [19, 32]]) } },

      // Buildings: flat when zoomed out, gently raised when zoomed in.
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

      // Labels
      { id: "water-name", type: "symbol", source: "omt", "source-layer": "water_name", filter: ["==", ["geometry-type"], "Point"], layout: { "text-field": ["get", "name:latin"], "text-font": ITALIC, "text-size": 13 }, paint: { "text-color": p.waterText, "text-halo-color": p.water, "text-halo-width": 1 } },
      { id: "water-name-line", type: "symbol", source: "omt", "source-layer": "water_name", filter: ["==", ["geometry-type"], "LineString"], layout: { "text-field": ["get", "name:latin"], "text-font": ITALIC, "text-size": 13, "symbol-placement": "line" }, paint: { "text-color": p.waterText, "text-halo-color": p.water, "text-halo-width": 1 } },
      { id: "waterway-name", type: "symbol", source: "omt", "source-layer": "waterway", minzoom: 13, layout: { "text-field": ["get", "name:latin"], "text-font": ITALIC, "text-size": 13, "symbol-placement": "line", "text-letter-spacing": 0.1 }, paint: { "text-color": p.waterText, "text-halo-color": p.water, "text-halo-width": 1 } },
      { id: "path-name", type: "symbol", source: "omt", "source-layer": "transportation_name", minzoom: 16.5, filter: ["==", ["get", "class"], "path"], layout: { "text-field": ["get", "name:latin"], "text-font": REGULAR, "text-size": 11, "symbol-placement": "line" }, paint: { "text-color": p.text, "text-halo-color": p.halo, "text-halo-width": 1.5 } },
      { id: "road-name", type: "symbol", source: "omt", "source-layer": "transportation_name", minzoom: 14, filter: ["in", ["get", "class"], ["literal", [...MAJOR, ...MEDIUM, "minor"]]], layout: { "text-field": ["get", "name:latin"], "text-font": REGULAR, "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10, 18, 13], "symbol-placement": "line", "text-letter-spacing": 0.02 }, paint: { "text-color": p.text, "text-halo-color": p.halo, "text-halo-width": 1.6 } },
      { id: "park-name", type: "symbol", source: "omt", "source-layer": "park", minzoom: 14, filter: ["==", ["geometry-type"], "Point"], layout: { "text-field": ["get", "name:latin"], "text-font": ITALIC, "text-size": 12, "text-max-width": 8 }, paint: { "text-color": look === "day" ? "#3F7A3A" : "#8CCB95", "text-halo-color": p.halo, "text-halo-width": 1.5 } },
      // Only a few kinds of place: universities, theatres, museums, sights, libraries and stations. No shops.
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
  return style as StyleSpecification;
}

// Colours for the "busy area" glow (a heatmap), from quiet to busy.
export function heatColours(look: Look) {
  const strength = look === "day" ? 1 : 1.4;
  return [
    "interpolate", ["linear"], ["heatmap-density"],
    0, "rgba(249,115,22,0)",
    0.2, `rgba(251,146,60,${0.3 * strength})`,
    0.55, `rgba(249,115,22,${0.45 * strength})`,
    1, `rgba(244,63,94,${0.55 * strength})`,
  ] as unknown as import("maplibre-gl").ExpressionSpecification;
}

// Switch between day and night without reloading the map.
export function applyLook(map: import("maplibre-gl").Map, look: Look) {
  for (const layer of mapStyle(look).layers) {
    if (!("paint" in layer) || !layer.paint || !map.getLayer(layer.id)) continue;
    for (const [key, value] of Object.entries(layer.paint)) map.setPaintProperty(layer.id, key as keyof import("maplibre-gl").AllPaintProperties, value);
  }
}

// Is it dark in London? Uses the standard sunrise/sunset formula.
export function isDark(at: Date, lat = 51.51, lng = -0.12) {
  const rad = Math.PI / 180;
  const day = Math.floor((Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()) - Date.UTC(at.getUTCFullYear(), 0, 0)) / 86_400_000);
  const g = (2 * Math.PI / 365) * (day - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl)) / rad;
  const sunrise = 720 - 4 * (lng + ha) - eqTime; // minutes after midnight, UTC
  const sunset = 720 - 4 * (lng - ha) - eqTime;
  const minutes = at.getUTCHours() * 60 + at.getUTCMinutes();
  return minutes < sunrise || minutes >= sunset;
}
