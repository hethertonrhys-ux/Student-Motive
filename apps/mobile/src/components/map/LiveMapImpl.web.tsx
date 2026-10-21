import { useEffect, useImperativeHandle, useRef } from "react";
import maplibre, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CATEGORY_ORDER, CATEGORY_STYLE, eventStatus, heatColours, mapCategoryLabel, mapLand, mapStyle, timeFormat, walkGeoJson, type Look, type MapEvent } from "@function/shared";
import { DARK, LIGHT } from "@/lib/theme";
import { ME_COLOUR, WALK_COLOUR, type MapProps } from "./types";

// The live map on the web, drawn by maplibre-gl: a port of the website's
// map (apps/web/src/app/map/live-map.tsx) with the pop-up cards taken out,
// since those are React Native here and shared with the phone app.

const SVG = "http://www.w3.org/2000/svg";

function iconSvg(path: string, size: number, colour: string) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", colour);
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(SVG, "path");
  p.setAttribute("d", path);
  svg.append(p);
  return svg;
}

function div(className: string) {
  const node = document.createElement("div");
  node.className = className;
  return node;
}

// A pin, like Snap Map's (the same as the phone's, Map.native.tsx): the
// category icon in a round bubble with a white edge, a red ring while it's
// on, a red badge with how many are going, and its name and start time
// underneath. The bubble is the middle of the pin, over the event's spot.
function pinElement(event: MapEvent, live: boolean) {
  const { colour, icon } = CATEGORY_STYLE[event.category];
  const when = live ? "On now" : timeFormat.format(new Date(event.startsAt));
  const root = div(`fn-pin${live ? " fn-live" : ""}`);
  root.style.setProperty("--c", colour);
  root.setAttribute("role", "button");
  root.setAttribute("aria-label", `${event.title}, ${mapCategoryLabel(event.category)}, ${when}, ${event.going} going`);
  root.setAttribute("data-testid", `pin-${event.id}`);
  root.tabIndex = 0;
  const inner = div("fn-pin-inner");
  const ring = div("fn-pin-ring");
  const bubble = div("fn-pin-bubble");
  bubble.append(iconSvg(icon, 20, "#fff"));
  ring.append(bubble);
  inner.append(ring);
  if (event.going > 0) {
    const badge = div("fn-pin-badge");
    badge.textContent = event.going > 99 ? "99+" : String(event.going);
    inner.append(badge);
  }
  const label = div("fn-pin-label");
  label.textContent = `${event.title} · ${when}`;
  inner.append(label);
  root.append(inner);
  return root;
}

// A group of nearby events: a white (or dark grey) bubble with the number
// and a Function red edge, and a red dot if one of them is on now.
function clusterElement(count: number, live: boolean) {
  const root = div("fn-cluster");
  root.setAttribute("role", "button");
  root.setAttribute("aria-label", `${count} events here. Tap to zoom in.`);
  root.setAttribute("data-testid", "cluster");
  root.tabIndex = 0;
  const inner = div("fn-cluster-inner");
  const size = count >= 20 ? 54 : count >= 6 ? 48 : 44;
  inner.style.width = inner.style.height = `${size}px`;
  inner.textContent = count > 99 ? "99+" : String(count);
  if (live) inner.append(div("fn-cluster-live"));
  root.append(inner);
  return root;
}

// The pins' styles (from the website's globals.css), added to the page once.
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif';
const PIN_CSS = `
.fn-map .maplibregl-ctrl-attrib { font: 10px ${FONT}; }
@media (prefers-color-scheme: dark) {
  .fn-map .maplibregl-ctrl-group { background: ${DARK.surface}; box-shadow: 0 0 0 1px ${DARK.line}; }
  .fn-map .maplibregl-ctrl-group button + button { border-top-color: ${DARK.line}; }
  .fn-map .maplibregl-ctrl-group button .maplibregl-ctrl-icon { filter: invert(1); }
  .fn-map .maplibregl-ctrl-attrib { background: rgba(28, 28, 30, 0.8); color: ${DARK.muted}; }
  .fn-map .maplibregl-ctrl-attrib a { color: ${DARK.ink}; }
}
.fn-pin, .fn-cluster { cursor: pointer; -webkit-tap-highlight-color: transparent; }
.fn-pin-inner { position: relative; width: 160px; padding-top: 24px; display: flex; flex-direction: column; align-items: center; animation: fn-pop 0.22s cubic-bezier(0.3, 1.4, 0.6, 1) both; }
.fn-pin-ring { width: 52px; height: 52px; box-sizing: border-box; border-radius: 50%; border: 2.5px solid transparent; display: grid; place-items: center; transition: transform 0.15s; }
.fn-live .fn-pin-ring { border-color: ${LIGHT.brand}; }
.fn-pin-bubble { width: 44px; height: 44px; box-sizing: border-box; border-radius: 50%; background: var(--c); border: 3px solid #fff; display: grid; place-items: center; box-shadow: 0 2px 6px rgb(0 0 0 / 0.18); }
.fn-pin:hover .fn-pin-ring, .fn-pin:focus-visible .fn-pin-ring { transform: scale(1.06); }
.fn-pin-badge { position: absolute; top: 22px; left: 98px; min-width: 20px; height: 20px; box-sizing: border-box; padding: 0 5px; border-radius: 10px; border: 2px solid #fff; background: ${LIGHT.brand}; color: #fff; font: 700 11px/16px ${FONT}; text-align: center; }
.fn-pin-label { margin-top: 2px; max-width: 160px; height: 22px; box-sizing: border-box; padding: 0 8px; border-radius: 11px; background: #fff; color: ${LIGHT.ink}; font: 600 12px/22px ${FONT}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 2px 6px rgb(0 0 0 / 0.18); }
.fn-cluster-inner { position: relative; box-sizing: border-box; border-radius: 50%; border: 3px solid ${LIGHT.brand}; background: #fff; color: ${LIGHT.ink}; display: grid; place-items: center; font: 700 16px/1 ${FONT}; box-shadow: 0 2px 6px rgb(0 0 0 / 0.18); animation: fn-pop 0.22s cubic-bezier(0.3, 1.4, 0.6, 1) both; transition: transform 0.15s; }
.fn-cluster:hover .fn-cluster-inner { transform: scale(1.06); }
.fn-cluster-live { position: absolute; right: -2px; top: -2px; width: 12px; height: 12px; box-sizing: border-box; border-radius: 50%; background: ${LIGHT.brand}; border: 2px solid #fff; }
.fn-me { width: 18px; height: 18px; border-radius: 50%; background: ${ME_COLOUR}; border: 3px solid #fff; box-shadow: 0 0 0 2px rgb(37 99 235 / 0.35), 0 2px 6px rgb(0 0 0 / 0.3); }
.fn-night .fn-live .fn-pin-ring, .fn-night .fn-cluster-inner { border-color: ${DARK.brand}; }
.fn-night .fn-pin-badge, .fn-night .fn-cluster-live { background: ${DARK.brand}; }
.fn-night .fn-pin-label { background: #2C2C2E; color: #fff; }
.fn-night .fn-cluster-inner { background: #2C2C2E; color: #fff; }
@keyframes fn-pop { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .fn-pin-inner, .fn-cluster-inner { animation: none; }
}
`;
function addPinCss() {
  if (document.getElementById("fn-map-css")) return;
  const style = document.createElement("style");
  style.id = "fn-map-css";
  style.textContent = PIN_CSS;
  document.head.append(style);
}

// Only the colours change between light and dark, so swap them in place.
function applyLook(map: MapLibreMap, look: Look) {
  for (const layer of mapStyle(look).layers as { id: string; paint?: Record<string, unknown> }[]) {
    if (!layer.paint || !map.getLayer(layer.id)) continue;
    for (const [key, value] of Object.entries(layer.paint)) map.setPaintProperty(layer.id, key as never, value as never);
  }
  map.setPaintProperty("heat", "heatmap-color", heatColours(look) as never);
}

function featuresOf(events: MapEvent[], now: number): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: events.map((e) => {
      const status = eventStatus(e, now);
      return { type: "Feature", geometry: { type: "Point", coordinates: [e.lng, e.lat] }, properties: { id: e.id, category: e.category, status, live: status === "live" ? 1 : 0 } };
    }),
  };
}

export function LiveMapImpl({ events, now, look, home, me, walk, onSelect, onReady, onError, ref }: MapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loaded = useRef(false);
  const lookRef = useRef(look); // the look wanted now
  const appliedLook = useRef(look); // the look the map is drawn in
  // The latest events and callbacks, for the map's own event handlers.
  const latest = useRef({ byId: new Map<string, MapEvent>(), now, onSelect });
  // eslint-disable-next-line react-hooks/refs -- the map's own event handlers read the latest props through this ref
  latest.current = { byId: new Map(events.map((e) => [e.id, e])), now, onSelect };

  useImperativeHandle(ref, () => ({
    flyTo: (target) => mapRef.current?.flyTo({ center: target.center, zoom: target.zoom, pitch: target.pitch ?? 0 }),
    fitWalk: (w) => {
      const lngs = w.line.map((p) => p[0]);
      const lats = w.line.map((p) => p[1]);
      // Room for the buttons at the top and the route bar at the bottom.
      mapRef.current?.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: { top: 100, bottom: 190, left: 50, right: 70 }, maxZoom: 17, pitch: 0 });
    },
  }));

  // Make the map once.
  useEffect(() => {
    if (!container.current) return;
    addPinCss();
    // Phones: one background worker is plenty, and a 3x-pixel canvas is far
    // more GPU work than anyone can see. Both keep the map smooth on iPhones.
    const phone = typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;
    if (phone) (maplibre as unknown as { setWorkerCount?: (n: number) => void }).setWorkerCount?.(1);
    const map = new maplibre.Map({
      container: container.current,
      style: mapStyle(lookRef.current),
      center: home,
      zoom: 16.2,
      // Flat and north-up, like Snap Map: no tilting or turning.
      pitch: 0,
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      minZoom: 9,
      maxZoom: 18,
      pixelRatio: Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2),
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibre.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("error", (e) => {
      if (String(e.error?.message ?? "").toLowerCase().includes("style")) onError?.();
    });

    const markers = new Map<string, Marker>();
    map.on("load", () => {
      // Events, grouped into a numbered bubble when they're close together.
      // Each group counts its categories (for the coloured ring) and live events.
      map.addSource("events", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 48,
        clusterMaxZoom: 17,
        clusterProperties: {
          liveCount: ["+", ["get", "live"]],
          ...Object.fromEntries(CATEGORY_ORDER.map((c) => [c, ["+", ["case", ["==", ["get", "category"], c], 1, 0]]])),
        },
      });
      // An invisible layer, so the map works out the groups for the pins below.
      map.addLayer({ id: "events-hidden", type: "circle", source: "events", paint: { "circle-radius": 0, "circle-opacity": 0 } });
      // The same events, not grouped, for the soft "busy area" glow when zoomed out.
      map.addSource("events-heat", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer(
        {
          id: "heat",
          type: "heatmap",
          source: "events-heat",
          maxzoom: 16,
          paint: {
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 22, 13, 48, 15, 70],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 1, 15, 1.8],
            "heatmap-color": heatColours(lookRef.current) as never,
            "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 13.5, 1, 16, 0],
          },
        },
        "water-name", // below the labels
      );
      // The walking route: a white-edged line, dotted when it's only an estimate, with a dot where you start.
      map.addSource("walk", { type: "geojson", data: walkGeoJson(null) });
      const lines = ["==", ["geometry-type"], "LineString"] as never;
      map.addLayer({ id: "walk-edge", type: "line", source: "walk", filter: lines, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 8 } });
      map.addLayer({ id: "walk-line", type: "line", source: "walk", filter: lines, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": WALK_COLOUR, "line-width": 5 } });
      map.addLayer({ id: "walk-start", type: "circle", source: "walk", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 7, "circle-color": ME_COLOUR, "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });

      // Tap a group: zoom in until it splits, or list them if they're all in one place.
      async function openGroup(clusterId: number, center: [number, number]) {
        const source = map.getSource("events") as GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(clusterId);
        if (zoom <= 17 && map.getZoom() < 17) {
          map.easeTo({ center, zoom: zoom + 0.2 });
          return;
        }
        const leaves = await source.getClusterLeaves(clusterId, 50, 0);
        const picked = leaves.map((leaf) => latest.current.byId.get(leaf.properties?.id as string)).filter((e): e is MapEvent => !!e);
        if (picked.length) latest.current.onSelect(picked);
      }

      // Pins are HTML so they can pop in, pulse and glow. Keep them in step
      // with whatever the map is showing (groups split as you zoom in).
      const syncMarkers = () => {
        if (!map.getSource("events") || !map.isSourceLoaded("events")) return;
        const seen = new Set<string>();
        for (const feature of map.querySourceFeatures("events")) {
          const p = feature.properties ?? {};
          const at = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
          const key = p.cluster ? `group:${p.cluster_id}:${p.point_count}:${p.liveCount}` : `${p.id}:${p.status}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (markers.has(key)) continue;
          let element: HTMLElement;
          if (p.cluster) {
            element = clusterElement(p.point_count, p.liveCount > 0);
            element.addEventListener("click", (e) => {
              e.stopPropagation();
              void openGroup(p.cluster_id, at);
            });
          } else {
            const event = latest.current.byId.get(p.id);
            if (!event) continue;
            element = pinElement(event, p.status === "live");
            element.addEventListener("click", (e) => {
              e.stopPropagation();
              latest.current.onSelect([event]);
            });
          }
          element.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              element.click();
            }
          });
          // Pins further south sit in front, so two at the same spot never hide each other's label.
          element.style.zIndex = String(Math.round((100 - at[1]) * 100000));
          markers.set(key, new maplibre.Marker({ element, anchor: "center" }).setLngLat(at).addTo(map));
        }
        for (const [key, marker] of markers) {
          if (!seen.has(key)) {
            marker.remove();
            markers.delete(key);
          }
        }
      };
      // Pins are re-laid-out when the map settles, not on every drawn frame.
      map.on("moveend", syncMarkers);
      map.on("idle", syncMarkers);
      map.on("sourcedata", (e) => {
        if (e.sourceId === "events" && e.isSourceLoaded) syncMarkers();
      });
      loaded.current = true;
      // The phone may have switched between light and dark while the map was loading.
      if (appliedLook.current !== lookRef.current) {
        appliedLook.current = lookRef.current;
        applyLook(map, lookRef.current);
      }
      onReady?.();
    });

    return () => {
      loaded.current = false;
      map.remove();
      mapRef.current = null;
    };
    // The map is made once; later changes arrive through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push the events onto the map whenever they actually change (the clock
  // ticks every 30 s, but most ticks change nothing on the map).
  const pushedKey = useRef("");
  const pushedHeatKey = useRef("");
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const push = () => {
      const fc = featuresOf(events, now);
      const key = fc.features.map((f) => `${f.properties?.id}:${f.properties?.status}`).join(",");
      if (key !== pushedKey.current) {
        pushedKey.current = key;
        (map.getSource("events") as GeoJSONSource | undefined)?.setData(fc);
      }
      const heatKey = events.map((e) => e.id).join(",");
      if (heatKey !== pushedHeatKey.current) {
        pushedHeatKey.current = heatKey;
        (map.getSource("events-heat") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: events.map((e) => ({ type: "Feature", geometry: { type: "Point", coordinates: [e.lng, e.lat] }, properties: {} })) });
      }
    };
    if (loaded.current) push();
    else map.once("load", push);
  }, [events, now]);

  // Light or dark map, following the phone's setting.
  useEffect(() => {
    lookRef.current = look;
    const map = mapRef.current;
    if (!map || !loaded.current || appliedLook.current === look) return;
    appliedLook.current = look;
    applyLook(map, look);
  }, [look]);

  // The walking route.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const draw = () => {
      (map.getSource("walk") as GeoJSONSource | undefined)?.setData(walkGeoJson(walk));
      if (walk) map.setPaintProperty("walk-line", "line-dasharray", walk.estimate ? [1, 2] : [1, 0]);
    };
    if (loaded.current) draw();
    else map.once("load", draw);
  }, [walk]);

  // Your blue dot.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !me) return;
    const marker = new maplibre.Marker({ element: div("fn-me") }).setLngLat(me).addTo(map);
    return () => {
      marker.remove();
    };
  }, [me]);

  return (
    <div className={`fn-map ${look === "night" ? "fn-night" : ""}`} style={{ position: "absolute", inset: 0, background: mapLand(look) }} data-testid="map">
      <div ref={container} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
