"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GeoJSONSource, GeolocateControl, Map as MapLibreMap, MapLayerMouseEvent, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapEvent, MapWindows } from "@/lib/map-events";
import { LSE, MAP_STYLE, distanceMetres, howFar } from "@/lib/map-style";
import { CATEGORIES, categoryLabel, type EventCategory } from "@/lib/types";

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

function eventCard(event: MapEvent, now: number, me: [number, number] | null) {
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
  if (me) card.append(el("div", "motive-pop-meta", `📍 ${howFar(distanceMetres(me, [event.lng, event.lat]))}`));
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
  // Your location, if you choose to share it. It stays in your browser:
  // it's only used to draw your blue dot and work out distances.
  const geolocateRef = useRef<GeolocateControl | null>(null);
  const [me, setMe] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const showPopupRef = useRef<((at: [number, number], content: HTMLElement) => void) | null>(null);

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
  const meRef = useRef(me);
  useEffect(() => {
    byIdRef.current = byId;
    nowRef.current = now;
    meRef.current = me;
  }, [byId, now, me]);

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

      // The "show my location" button (above the zoom buttons). The browser
      // asks permission the first time.
      const geolocate = new maplibre.GeolocateControl({
        positionOptions: { enableHighAccuracy: true, timeout: 15_000 },
        trackUserLocation: true,
        showAccuracyCircle: true,
        fitBoundsOptions: { maxZoom: 15.5 },
      });
      geolocateRef.current = geolocate;
      map.addControl(geolocate, "bottom-right");
      geolocate.on("geolocate", (e) => {
        setMe([e.coords.longitude, e.coords.latitude]);
        setLocating(false);
        setLocationError(null);
      });
      geolocate.on("error", (e) => {
        setLocating(false);
        setLocationError(
          e.code === 1
            ? "Location is turned off for Function. Allow it in your phone's settings to see what's near you."
            : "Couldn't find your location. Try again outside or near a window.",
        );
      });
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
          showPopup([event.lng, event.lat], eventCard(event, nowRef.current, meRef.current));
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
            if (event) list.append(eventCard(event, nowRef.current, meRef.current));
          }
          showPopup(center, list);
        });

        for (const layer of ["points", "clusters"]) {
          map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
        }

        setReady(true);

        // Already said yes before? Show your location straight away.
        navigator.permissions
          ?.query({ name: "geolocation" })
          .then((p) => {
            if (p.state === "granted" && !cancelled) geolocate.trigger();
          })
          .catch(() => {});
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
      showPopupRef.current = showPopup;
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

  const nearest = useMemo(() => {
    if (!me || visible.length === 0) return null;
    return visible
      .map((e) => ({ event: e, metres: distanceMetres(me, [e.lng, e.lat]) }))
      .sort((a, b) => a.metres - b.metres)[0];
  }, [me, visible]);

  function findMe() {
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError("This browser can't share your location.");
      return;
    }
    if (geolocateRef.current?.trigger()) setLocating(true);
  }

  function goTo(event: MapEvent) {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [event.lng, event.lat], zoom: Math.max(map.getZoom(), 16) });
    showPopupRef.current?.([event.lng, event.lat], eventCard(event, now, me));
  }

  return (
    <div className="relative h-[calc(100dvh-57px-var(--banner-h,0px))] w-full overflow-hidden">
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
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
          {nearest ? (
            <button type="button" onClick={() => goTo(nearest.event)} className="mt-0.5 block max-w-52 text-left text-xs text-muted">
              Nearest: <span className="font-semibold text-brand">{nearest.event.title}</span> · {howFar(nearest.metres)}
            </button>
          ) : (
            !me && (
              <button type="button" onClick={findMe} disabled={locating} className="mt-0.5 text-xs font-semibold text-brand">
                {locating ? "Finding you…" : "📍 Show what's near me"}
              </button>
            )
          )}
          {locationError && <p className="mt-1 max-w-52 text-xs text-danger">{locationError}</p>}
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
