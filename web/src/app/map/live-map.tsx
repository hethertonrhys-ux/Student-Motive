"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapEvent, MapWindows } from "@/lib/map-events";
import { CATEGORIES, categoryLabel, type EventCategory } from "@/lib/types";

// Free map tiles from OpenFreeMap: no account or API key needed.
const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/positron";

const LSE: [number, number] = [-0.1168, 51.5146];
const BRAND = "#4338ca";
const LIVE = "#f43f5e";
const SOON_MS = 60 * 60 * 1000;

type When = "now" | "tonight" | "tomorrow";
const WHEN_OPTIONS: { value: When; label: string }[] = [
  { value: "now", label: "Now" },
  { value: "tonight", label: "Tonight" },
  { value: "tomorrow", label: "Tomorrow" },
];

const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function status(event: MapEvent, now: number): "live" | "soon" | "later" {
  const start = new Date(event.startsAt).getTime();
  const end = new Date(event.endsAt).getTime();
  if (start <= now && now < end) return "live";
  if (start > now && start - now <= SOON_MS) return "soon";
  return "later";
}

function inWindow(event: MapEvent, when: When, windows: MapWindows, now: number) {
  const start = new Date(event.startsAt).getTime();
  const end = new Date(event.endsAt).getTime();
  const tonightEnds = new Date(windows.tonightEnds).getTime();
  const tomorrowEnds = new Date(windows.tomorrowEnds).getTime();
  if (end <= now) return false;
  if (when === "now") return start - now <= SOON_MS;
  if (when === "tonight") return start < tonightEnds;
  return start >= tonightEnds && start < tomorrowEnds;
}

// Popups are built from DOM nodes (not HTML strings) so event titles can't inject code.
function el(tag: string, className: string, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function eventCard(event: MapEvent, now: number) {
  const s = status(event, now);
  const card = el("a", "motive-pop") as HTMLAnchorElement;
  card.href = `/e/${event.id}`;
  const top = el("div", "motive-pop-top");
  if (s === "live") top.append(el("span", "motive-pop-live", "LIVE"));
  top.append(el("span", "motive-pop-cat", categoryLabel(event.category) + (event.freeFood ? " · Free food" : "")));
  card.append(top);
  card.append(el("div", "motive-pop-title", event.title));
  if (event.society) card.append(el("div", "motive-pop-soc", event.society));
  const when = s === "live" ? `Until ${time.format(new Date(event.endsAt))}` : `${time.format(new Date(event.startsAt))}–${time.format(new Date(event.endsAt))}`;
  card.append(el("div", "motive-pop-meta", `${when} · ${event.place}`));
  card.append(el("div", "motive-pop-going", s === "live" ? `${event.going} there or going` : `${event.going} going`));
  return card;
}

type Props = { events: MapEvent[]; windows: MapWindows };

export function LiveMap({ events, windows }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const popupClassRef = useRef<typeof Popup | null>(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [when, setWhen] = useState<When>("tonight");
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [freeFood, setFreeFood] = useState(false);
  const [now, setNow] = useState(() => new Date(windows.now).getTime());

  // Keep "live" up to date, and fetch fresh events every minute.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const refresh = setInterval(() => router.refresh(), 60_000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router]);

  const visible = useMemo(
    () =>
      events.filter(
        (e) =>
          inWindow(e, when, windows, now) &&
          (categories.length === 0 || categories.includes(e.category)) &&
          (!freeFood || e.freeFood),
      ),
    [events, when, windows, now, categories, freeFood],
  );
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const byIdRef = useRef(byId);
  const nowRef = useRef(now);
  useEffect(() => {
    byIdRef.current = byId;
    nowRef.current = now;
  }, [byId, now]);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let frame = 0;

    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;
      // Copied into public/ by scripts/copy-map-worker.mjs.
      maplibre.setWorkerUrl("/maplibre-gl-worker.mjs");
      popupClassRef.current = maplibre.Popup;

      const map = new maplibre.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: LSE,
        zoom: 15.6,
        minZoom: 9,
        maxZoom: 19,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "bottom-right");
      map.on("error", (e) => {
        if (String(e.error?.message ?? "").toLowerCase().includes("style")) setMapError(true);
      });

      map.on("load", () => {
        map.addSource("events", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          cluster: true,
          clusterRadius: 44,
          clusterMaxZoom: 17,
          // Count live events inside each group, so groups with something live show pink-red.
          clusterProperties: { liveCount: ["+", ["get", "live"]] },
        });

        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "events",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": ["case", [">", ["get", "liveCount"], 0], LIVE, BRAND],
            "circle-radius": ["step", ["get", "point_count"], 16, 5, 20, 15, 26],
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ffffff",
          },
        });
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "events",
          filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 13 },
          paint: { "text-color": "#ffffff" },
        });
        map.addLayer({
          id: "live-pulse",
          type: "circle",
          source: "events",
          filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "status"], "live"]],
          paint: { "circle-color": LIVE, "circle-radius": 10, "circle-opacity": 0.4 },
        });
        map.addLayer({
          id: "points",
          type: "circle",
          source: "events",
          filter: ["!", ["has", "point_count"]],
          paint: {
            // Live = pink-red, starting within the hour = hollow ring, later = indigo.
            "circle-color": ["match", ["get", "status"], "live", LIVE, "soon", "#ffffff", BRAND],
            "circle-radius": 9,
            "circle-stroke-width": ["match", ["get", "status"], "soon", 3.5, 3],
            "circle-stroke-color": ["match", ["get", "status"], "soon", BRAND, "#ffffff"],
          },
        });

        // Pulse animation for live events.
        const animate = (t: number) => {
          const phase = (t % 1600) / 1600;
          map.setPaintProperty("live-pulse", "circle-radius", 10 + phase * 18);
          map.setPaintProperty("live-pulse", "circle-opacity", 0.45 * (1 - phase));
          frame = requestAnimationFrame(animate);
        };
        frame = requestAnimationFrame(animate);

        map.on("click", "points", (e: MapLayerMouseEvent) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          const event = id ? byIdRef.current.get(id) : undefined;
          if (!event) return;
          showPopup([event.lng, event.lat], eventCard(event, nowRef.current));
        });

        map.on("click", "clusters", async (e: MapLayerMouseEvent) => {
          const feature = e.features?.[0];
          if (!feature) return;
          const clusterId = feature.properties?.cluster_id as number;
          const source = map.getSource("events") as GeoJSONSource;
          const center = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
          const zoom = await source.getClusterExpansionZoom(clusterId);
          if (zoom <= 17 && map.getZoom() < 17) {
            map.easeTo({ center, zoom: zoom + 0.2 });
            return;
          }
          // Several events at the same place: list them.
          const leaves = await source.getClusterLeaves(clusterId, 50, 0);
          const list = el("div", "motive-pop-list");
          for (const leaf of leaves) {
            const event = byIdRef.current.get(leaf.properties?.id as string);
            if (event) list.append(eventCard(event, nowRef.current));
          }
          showPopup(center, list);
        });

        for (const layer of ["points", "clusters"]) {
          map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
        }

        setReady(true);
      });

      function showPopup(at: [number, number], content: HTMLElement) {
        const PopupClass = popupClassRef.current;
        if (!PopupClass) return;
        popupRef.current?.remove();
        popupRef.current = new PopupClass({ offset: 14, maxWidth: "280px", closeButton: true })
          .setLngLat(at)
          .setDOMContent(content)
          .addTo(map);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      popupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Push the filtered events onto the map whenever filters or data change.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const source = map.getSource("events") as GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: visible.map((e) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [e.lng, e.lat] },
        properties: { id: e.id, status: status(e, now), live: status(e, now) === "live" ? 1 : 0 },
      })),
    });
  }, [ready, visible, now]);

  function toggleCategory(value: EventCategory) {
    setCategories((current) => (current.includes(value) ? current.filter((c) => c !== value) : [...current, value]));
  }

  function flyTo(view: "lse" | "london") {
    mapRef.current?.flyTo(view === "lse" ? { center: LSE, zoom: 15.6 } : { center: [-0.118, 51.512], zoom: 11.6 });
  }

  const liveCount = visible.filter((e) => status(e, now) === "live").length;

  return (
    <div className="relative h-[calc(100dvh-57px)] w-full overflow-hidden">
      {/* The map library sets its own position on the inner div, so size the wrapper instead. */}
      <div className="absolute inset-0 bg-[#e9ebf0]">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {/* Filters */}
      <div className="pointer-events-none absolute inset-x-0 top-0 space-y-2 p-3">
        <div className="pointer-events-auto mx-auto flex w-fit rounded-full border border-line bg-surface p-1 shadow-lg">
          {WHEN_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setWhen(option.value)}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                when === option.value ? "bg-brand text-brand-ink" : "text-muted hover:text-ink"
              }`}
            >
              {option.value === "now" && <span className="mr-1.5 inline-block size-2 rounded-full bg-live align-middle" />}
              {option.label}
            </button>
          ))}
        </div>
        <div className="pointer-events-auto -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:justify-center">
          {CATEGORIES.map((c) => (
            <Chip key={c.value} active={categories.includes(c.value)} onClick={() => toggleCategory(c.value)}>
              {c.label}
            </Chip>
          ))}
          <Chip active={freeFood} onClick={() => setFreeFood((f) => !f)}>
            Free food 🍕
          </Chip>
        </div>
      </div>

      {/* Status bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
        <div className="pointer-events-auto rounded-2xl border border-line bg-surface px-4 py-2.5 shadow-lg">
          <p className="text-sm font-bold">
            {visible.length} {visible.length === 1 ? "event" : "events"}
            {liveCount > 0 && <span className="text-live"> · {liveCount} live</span>}
          </p>
          {visible.length === 0 && (
            <p className="text-xs text-muted">
              {when === "now" ? "Nothing on right now. Try Tonight." : "Nothing posted yet. Check back soon."}
            </p>
          )}
        </div>
        <div className="pointer-events-auto mr-12 flex gap-2">
          <button type="button" onClick={() => flyTo("lse")} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-bold shadow-lg">
            LSE
          </button>
          <button type="button" onClick={() => flyTo("london")} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-bold shadow-lg">
            London
          </button>
        </div>
      </div>

      {mapError && (
        <div className="absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded-2xl border border-line bg-surface px-5 py-4 text-center shadow-lg">
          <p className="font-bold">The map couldn&apos;t load</p>
          <p className="text-sm text-muted">Check your internet connection and refresh.</p>
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold shadow-sm transition ${
        active ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-ink hover:border-brand"
      }`}
    >
      {children}
    </button>
  );
}
