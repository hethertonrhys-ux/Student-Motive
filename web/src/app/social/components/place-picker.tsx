"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LSE, MAP_STYLE } from "@/lib/map-style";

export type Point = { lng: number; lat: number };
type Result = { label: string; detail: string; point: Point };

// Address search using Photon (built on OpenStreetMap): free, no key.
// Results near LSE come first.
async function searchPlaces(query: string, signal: AbortSignal): Promise<Result[]> {
  const url = `https://photon.komoot.io/api/?limit=5&lang=en&lat=${LSE[1]}&lon=${LSE[0]}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as {
    features: { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }[];
  };
  return data.features.map(({ geometry, properties: p }) => {
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const label = p.name || street || p.city || query;
    const detail = [p.name ? street : null, p.district, p.city ?? p.county, p.postcode].filter(Boolean).join(", ");
    return { label, detail, point: { lng: geometry.coordinates[0], lat: geometry.coordinates[1] } };
  });
}

// Search for a place and/or tap the map to drop a pin.
export function PlacePicker({ pin, onPick }: { pin: Point | null; onPick: (point: Point, name?: string, detail?: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPickRef = useRef(onPick);
  const initialPin = useRef(pin);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;
      maplibre.setWorkerUrl("/maplibre-gl-worker.mjs");
      const start = initialPin.current;
      const map = new maplibre.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: start ? [start.lng, start.lat] : LSE,
        zoom: start ? 16 : 13,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "bottom-right");
      mapRef.current = map;
      const marker = new maplibre.Marker({ color: "#4338ca", draggable: true });
      markerRef.current = marker;
      if (start) marker.setLngLat([start.lng, start.lat]).addTo(map);
      marker.on("dragend", () => {
        const { lng, lat } = marker.getLngLat();
        onPickRef.current({ lng, lat });
      });
      map.on("click", (e) => {
        marker.setLngLat(e.lngLat).addTo(map);
        onPickRef.current({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(false);
      try {
        setResults(await searchPlaces(q, controller.signal));
      } catch {
        if (!controller.signal.aborted) setSearchError(true);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function choose(r: Result) {
    const map = mapRef.current;
    if (map && markerRef.current) {
      markerRef.current.setLngLat([r.point.lng, r.point.lat]).addTo(map);
      map.flyTo({ center: [r.point.lng, r.point.lat], zoom: 16 });
    }
    onPick(r.point, r.label, r.detail);
    setResults(null);
    setQuery("");
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (results?.[0]) choose(results[0]);
            }
          }}
          placeholder="Search a place, address or postcode"
          aria-label="Search for the place"
          autoComplete="off"
          className="input"
        />
        {(results || searching || searchError) && query.trim().length >= 3 && (
          <ul className="absolute inset-x-0 z-20 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
            {searching && !results && <li className="px-3 py-2.5 text-sm text-muted">Searching…</li>}
            {searchError && <li className="px-3 py-2.5 text-sm text-danger">Search isn&apos;t working right now. Tap the map instead.</li>}
            {results?.length === 0 && <li className="px-3 py-2.5 text-sm text-muted">No matches. Try a postcode, or tap the map.</li>}
            {results?.map((r, i) => (
              <li key={i}>
                <button type="button" onClick={() => choose(r)} className="block w-full px-3 py-2.5 text-left hover:bg-brand-soft">
                  <span className="block font-semibold">{r.label}</span>
                  {r.detail && <span className="block text-xs text-muted">{r.detail}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="relative h-56 overflow-hidden rounded-xl bg-[#e9ebf0]">
        <div ref={containerRef} className="absolute inset-0" />
      </div>
      <p className={`text-sm ${pin ? "font-semibold text-ok" : "text-muted"}`}>
        {pin ? "✓ Pin placed. Drag it to adjust." : "Search above, or tap the map to drop a pin."}
      </p>
    </div>
  );
}
