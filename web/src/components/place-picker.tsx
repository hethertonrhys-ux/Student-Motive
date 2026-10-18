"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { searchLsePlaces } from "@/lib/lse-places";
import { LSE, MAP_STYLE } from "@/lib/map-style";

export type Point = { lng: number; lat: number };
type Result = { label: string; detail: string; point: Point };

// LSE buildings, halls and theatres first (from our own list, instantly),
// then addresses from Photon (built on OpenStreetMap): free, no key, with
// results near LSE first.
function lseResults(query: string): Result[] {
  return searchLsePlaces(query).map((p) => ({ label: p.name, detail: p.detail, point: { lng: p.at[0], lat: p.at[1] } }));
}

async function searchAddresses(query: string, signal: AbortSignal): Promise<Result[]> {
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

// Search for a place and/or tap the map to drop a pin, then drag the pin to
// adjust. Used when hosting a Social event, on society event forms
// ("Somewhere else") and on the older hosting page.
export function PlacePicker({
  pin,
  onPick,
  label,
}: {
  pin: Point | null;
  onPick: (point: Point, name?: string, detail?: string) => void;
  label?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPickRef = useRef(onPick);
  const initialPin = useRef(pin);
  const [query, setQuery] = useState("");
  // The place chosen from the list stays in the box, so it's clear it's set.
  const [chosen, setChosen] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Result[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  // Create the little map once. Tap it, or drag the pin, to set the spot.
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
        zoom: start ? 16 : 15,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "bottom-right");
      mapRef.current = map;
      // On phones the map can be laid out before its box has its final size.
      // Also keep the map credit folded away (it opens itself on small maps).
      map.once("load", () => {
        map.resize();
        const credit = containerRef.current?.querySelector(".maplibregl-ctrl-attrib");
        credit?.classList.remove("maplibregl-compact-show");
        credit?.removeAttribute("open");
      });
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

  const typing = query.trim().length >= 2 && query !== chosen;
  const lse = typing ? lseResults(query) : [];

  // Look up addresses as you type (after a short pause).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || query === chosen) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(false);
      try {
        setAddresses(await searchAddresses(q, controller.signal));
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
  }, [query, chosen]);

  const shownAddresses = query.trim().length >= 3 ? (addresses ?? []).filter((a) => !lse.some((l) => l.label === a.label)) : [];
  const results = [...lse, ...shownAddresses];

  function choose(r: Result) {
    const map = mapRef.current;
    if (map && markerRef.current) {
      markerRef.current.setLngLat([r.point.lng, r.point.lat]).addTo(map);
      map.flyTo({ center: [r.point.lng, r.point.lat], zoom: 17 });
    }
    onPick(r.point, r.label, r.detail);
    const text = r.label;
    setQuery(text);
    setChosen(text);
    setAddresses(null);
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        {label && (
          <label htmlFor="place_search" className="label">
            {label}
          </label>
        )}
        <input
          id="place_search"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (chosen) setChosen(null);
          }}
          onKeyDown={(e) => {
            // Enter picks the first result instead of submitting the whole form.
            if (e.key === "Enter") {
              e.preventDefault();
              if (typing && results[0]) choose(results[0]);
            }
          }}
          placeholder="Search an LSE building, place, address or postcode"
          aria-label="Search for the place"
          autoComplete="off"
          className={`input ${chosen ? "border-ok font-semibold" : ""}`}
        />
        {typing && (results.length > 0 || searching || searchError || query.trim().length >= 3) && (
          <ul className="absolute inset-x-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface shadow-xl">
            {results.map((r, i) => (
              <li key={`${r.label}-${i}`}>
                <button type="button" onClick={() => choose(r)} className="block w-full px-3 py-2.5 text-left hover:bg-brand-soft">
                  <span className="block font-semibold">{r.label}</span>
                  {r.detail && <span className="block text-xs text-muted">{r.detail}</span>}
                </button>
              </li>
            ))}
            {searching && shownAddresses.length === 0 && <li className="px-3 py-2.5 text-sm text-muted">Searching…</li>}
            {searchError && lse.length === 0 && <li className="px-3 py-2.5 text-sm text-danger">Search isn&apos;t working right now. Tap the map instead.</li>}
            {!searching && !searchError && results.length === 0 && addresses && (
              <li className="px-3 py-2.5 text-sm text-muted">No matches. Try a postcode, or tap the map.</li>
            )}
          </ul>
        )}
      </div>
      {/* The map library sets its own position on the inner div (overriding
          "absolute"), so the wrapper has the height and the map fills it. */}
      <div className="h-64 overflow-hidden rounded-xl bg-[#e9ebf0]">
        <div ref={containerRef} className="h-full w-full" />
      </div>
      <p className={`text-sm ${pin ? "font-semibold text-ok" : "text-muted"}`}>
        {pin ? "✓ Pin placed. Drag it to adjust." : "Search above, or tap the map to drop a pin."}
      </p>
    </div>
  );
}
