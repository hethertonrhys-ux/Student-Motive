"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GeoJSONSource, GeolocateControl, Map as MapLibreMap, Marker, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapEvent, MapWindows } from "@/lib/map-events";
import { LSE, distanceMetres, howFar } from "@/lib/map-style";
import { categoryLabel } from "@/lib/types";
import { FilterButton, FilterPanel, SearchBar, SearchButton, normalise, useSavedCategories } from "./map-controls";
import { type Look, applyLook, heatColours, isDark, mapStyle } from "./map-theme";
import { CATEGORY_ORDER, CATEGORY_STYLE, clusterElement, iconSvg, pinElement } from "./pins";

const SOON_MS = 60 * 60 * 1000;
// Zoomed in at LSE, the map tilts slightly so buildings look 3D.
const LSE_VIEW = { center: LSE, zoom: 16.2, pitch: 35 };

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
  const chip = el("span", "fn-chip");
  chip.style.setProperty("--c", CATEGORY_STYLE[event.category].colour);
  chip.append(iconSvg(event.category, 13, "currentColor"), categoryLabel(event.category) + (event.freeFood ? " · Free food" : ""));
  top.append(chip);
  card.append(top);
  card.append(el("div", "motive-pop-title", event.title));
  if (event.society) card.append(el("div", "motive-pop-soc", event.society));
  const when = s === "live" ? `Until ${time.format(new Date(event.endsAt))}` : `${time.format(new Date(event.startsAt))}–${time.format(new Date(event.endsAt))}`;
  card.append(el("div", "motive-pop-meta", `${when} · ${event.place}`));
  card.append(el("div", "motive-pop-going", s === "live" ? `${event.going} there or going` : `${event.going} going`));
  if (me) card.append(el("div", "motive-pop-meta", `📍 ${howFar(distanceMetres(me, [event.lng, event.lat]))}`));
  card.append(el("span", "fn-details", "View details"));
  return card;
}

type Props = { events: MapEvent[]; windows: MapWindows; forceLook?: Look };

export function LiveMap({ events, windows, forceLook }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const popupClassRef = useRef<typeof Popup | null>(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [when, setWhen] = useState<When>("tonight");
  // Category filters are remembered on this device; nothing ticked shows everything.
  const [categories, setCategories] = useSavedCategories();
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(true);
  const [now, setNow] = useState(() => new Date(windows.now).getTime());
  // Night colours from sunset to sunrise.
  const look: Look = forceLook ?? (isDark(new Date(now)) ? "night" : "day");
  const lookRef = useRef(look);
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

  // Time, categories and search all combine.
  const categoryKey = categories.join(",");
  const filtered = useMemo(
    () => {
      const chosen = categoryKey ? categoryKey.split(",") : [];
      return events.filter((e) => inWindow(e, when, windows, now) && (chosen.length === 0 || chosen.includes(e.category)));
    },
    [events, when, windows, now, categoryKey],
  );
  const words = useMemo(() => normalise(query).split(" ").filter(Boolean), [query]);
  const visible = useMemo(
    () =>
      words.length === 0
        ? filtered
        : filtered.filter((e) => {
            const text = normalise(`${e.title} ${e.society} ${e.place}`);
            return words.every((w) => text.includes(w));
          }),
    [filtered, words],
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

    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;
      // Copied into public/ by scripts/copy-map-worker.mjs.
      maplibre.setWorkerUrl("/maplibre-gl-worker.mjs");
      popupClassRef.current = maplibre.Popup;

      const map = new maplibre.Map({
        container: containerRef.current,
        style: mapStyle(lookRef.current),
        ...LSE_VIEW,
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
              "heatmap-color": heatColours(lookRef.current),
              "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 13.5, 1, 16, 0],
            },
          },
          "water-name", // below the labels
        );

        // Pins are HTML so they can pop in, pulse and glow. Keep them in step
        // with whatever the map is showing (groups split as you zoom in).
        const markers = new Map<string, Marker>();
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
              const counts = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, Number(p[c] ?? 0)]));
              element = clusterElement(p.point_count, counts, p.liveCount > 0);
              element.addEventListener("click", (e) => {
                e.stopPropagation();
                openGroup(p.cluster_id, at);
              });
            } else {
              const event = byIdRef.current.get(p.id);
              if (!event) continue;
              element = pinElement(event.category, p.status === "live", `${event.title}, ${categoryLabel(event.category)}`);
              element.addEventListener("click", (e) => {
                e.stopPropagation();
                showPopup([event.lng, event.lat], eventCard(event, nowRef.current, meRef.current), 52);
              });
            }
            element.addEventListener("keydown", (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                element.click();
              }
            });
            markers.set(key, new maplibre.Marker({ element, anchor: p.cluster ? "center" : "bottom" }).setLngLat(at).addTo(map));
          }
          for (const [key, marker] of markers) {
            if (!seen.has(key)) {
              marker.remove();
              markers.delete(key);
            }
          }
        };
        map.on("render", syncMarkers);

        // Tap a group: zoom in until it splits, or list them if they're all in one place.
        async function openGroup(clusterId: number, center: [number, number]) {
          const source = map.getSource("events") as GeoJSONSource;
          const zoom = await source.getClusterExpansionZoom(clusterId);
          if (zoom <= 17 && map.getZoom() < 17) {
            map.easeTo({ center, zoom: zoom + 0.2 });
            return;
          }
          const leaves = await source.getClusterLeaves(clusterId, 50, 0);
          const list = el("div", "motive-pop-list");
          for (const leaf of leaves) {
            const event = byIdRef.current.get(leaf.properties?.id as string);
            if (event) list.append(eventCard(event, nowRef.current, meRef.current));
          }
          showPopup(center, list, 26);
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

      function showPopup(at: [number, number], content: HTMLElement, offset = 52) {
        const PopupClass = popupClassRef.current;
        if (!PopupClass) return;
        popupRef.current?.remove();
        popupRef.current = new PopupClass({ offset, maxWidth: "280px", closeButton: true })
          .setLngLat(at)
          .setDOMContent(content)
          .addTo(map);
      }
      showPopupRef.current = showPopup;
    })();

    return () => {
      cancelled = true;
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
        properties: { id: e.id, category: e.category, status: status(e, now), live: status(e, now) === "live" ? 1 : 0 },
      })),
    });
    (map.getSource("events-heat") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: visible.map((e) => ({ type: "Feature", geometry: { type: "Point", coordinates: [e.lng, e.lat] }, properties: {} })),
    });
  }, [ready, visible, now]);

  // Switch to night colours after sunset (and back in the morning).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || lookRef.current === look) return;
    lookRef.current = look;
    applyLook(map, look);
    map.setPaintProperty("heat", "heatmap-color", heatColours(look));
  }, [ready, look]);

  function flyTo(view: "lse" | "london") {
    mapRef.current?.flyTo(view === "lse" ? LSE_VIEW : { center: [-0.118, 51.512], zoom: 11.6, pitch: 0 });
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
    <div className="relative h-[calc(100dvh-57px-var(--banner-h,0px)-var(--tabbar-h))] w-full overflow-hidden">
      {/* The map library sets its own position on the inner div, so size the wrapper instead. */}
      <div className={`absolute inset-0 ${look === "night" ? "fn-night bg-[#171C27]" : "bg-[#F7F6F2]"}`}>
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {/* Top row: time, filter and search. Search replaces the row while open. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3">
        {searchOpen ? (
          <SearchBar
            value={query}
            onChange={(v) => {
              setQuery(v);
              setShowResults(true);
            }}
            onCancel={() => {
              setSearchOpen(false);
              setQuery("");
            }}
          />
        ) : (
          <div className="relative flex items-center justify-center gap-2 max-[359px]:gap-1.5">
            <div className="pointer-events-auto flex rounded-full border border-line bg-surface p-1 shadow-lg">
              {WHEN_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setWhen(option.value)}
                  aria-pressed={when === option.value}
                  className={`rounded-full px-3 py-1.5 text-sm font-bold whitespace-nowrap transition max-[359px]:px-2 max-[359px]:text-[13px] min-[400px]:px-4 ${
                    when === option.value ? "bg-brand text-brand-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  {option.value === "now" && <span className="mr-1.5 inline-block size-2 rounded-full bg-live align-middle" />}
                  {option.label}
                </button>
              ))}
            </div>
            <span className="pointer-events-auto">
              <FilterButton count={categories.length} open={filterOpen} onClick={() => setFilterOpen((o) => !o)} />
            </span>
            <span className="pointer-events-auto">
              <SearchButton
                onClick={() => {
                  setFilterOpen(false);
                  setSearchOpen(true);
                }}
              />
            </span>
            {filterOpen && <FilterPanel selected={categories} onChange={setCategories} onClose={() => setFilterOpen(false)} />}
          </div>
        )}

        {/* Search results, as you type */}
        {searchOpen && words.length > 0 && showResults && (
          <ul className="pointer-events-auto mt-2 max-h-[45vh] overflow-y-auto rounded-2xl border border-line bg-surface shadow-xl">
            {visible.slice(0, 20).map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => {
                    setShowResults(false);
                    (document.activeElement as HTMLElement | null)?.blur();
                    goTo(e);
                  }}
                  className="block w-full border-b border-line px-4 py-2.5 text-left last:border-0 hover:bg-brand-soft"
                >
                  <span className="flex items-center gap-2">
                    {status(e, now) === "live" && <span className="rounded-full bg-live px-1.5 text-[10px] font-bold text-white">LIVE</span>}
                    <span className="truncate font-semibold">{e.title}</span>
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {[e.society, `${time.format(new Date(e.startsAt))}`, e.place].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
            {visible.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted">
                No {WHEN_OPTIONS.find((o) => o.value === when)?.label.toLowerCase()} events match
                {categories.length ? " your filters" : ""}. Try another time{categories.length ? " or clear the filters" : ""}.
              </li>
            )}
          </ul>
        )}
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
              {words.length
                ? "Nothing matches your search."
                : categories.length
                  ? "Nothing in your chosen categories. Change the filter."
                  : when === "now"
                    ? "Nothing on right now. Try Tonight."
                    : "Nothing posted yet. Check back soon."}
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
