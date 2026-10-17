"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LSE, MAP_STYLE } from "@/lib/map-style";
import type { MotiveEvent, Venue } from "@/lib/types";

const VENUE_GROUPS: { kind: Venue["kind"]; label: string }[] = [
  { kind: "campus", label: "LSE campus" },
  { kind: "hall", label: "LSE halls" },
  { kind: "university", label: "Other universities" },
  { kind: "club", label: "Clubs & bars" },
  { kind: "other", label: "Other" },
];

export const CUSTOM_PLACE = "custom";

type Point = { lng: number; lat: number };
type SearchResult = { label: string; detail: string; point: Point };

// Address search using Photon (built on OpenStreetMap): free, no key.
// Results near LSE come first.
async function searchPlaces(query: string, signal: AbortSignal): Promise<SearchResult[]> {
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

// "Where" on the event form: a listed venue, or anywhere else by
// searching for it and/or dropping a pin on a map.
export function WhereField({ venues, event }: { venues: Venue[]; event?: MotiveEvent }) {
  const startsCustom = Boolean(event && !event.venue_id && event.lat != null && event.lng != null);
  const [choice, setChoice] = useState(event ? (startsCustom ? CUSTOM_PLACE : (event.venue_id ?? "")) : "");
  const custom = choice === CUSTOM_PLACE;
  const [pin, setPin] = useState<Point | null>(startsCustom ? { lng: event!.lng!, lat: event!.lat! } : null);
  const [placeName, setPlaceName] = useState(event?.location_note ?? "");

  return (
    <div className="space-y-4">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="venue_id" className="label">Where</label>
          <select id="venue_id" name="venue_id" required value={choice} onChange={(e) => setChoice(e.target.value)} className="input">
            <option value="" disabled>Choose a place…</option>
            <option value={CUSTOM_PLACE}>📍 Somewhere else (pick it on a map)</option>
            {VENUE_GROUPS.map((group) => {
              const options = venues.filter((v) => v.kind === group.kind);
              if (options.length === 0) return null;
              return (
                <optgroup key={group.kind} label={group.label}>
                  {options.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}{v.short_name ? ` (${v.short_name})` : ""}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>
        <div>
          <label htmlFor="location_note" className="label">
            {custom ? "Place name" : <>Room or details <span className="font-normal text-muted">(optional)</span></>}
          </label>
          <input
            id="location_note"
            name="location_note"
            maxLength={120}
            required={custom}
            value={placeName}
            onChange={(e) => setPlaceName(e.target.value)}
            placeholder={custom ? "e.g. The Fellow, King's Cross (back room)" : "e.g. 4th floor, room 4.02"}
            className="input"
          />
        </div>
      </div>

      {custom && (
        <PlacePicker
          pin={pin}
          onPick={(point, name) => {
            setPin(point);
            if (name && !placeName.trim()) setPlaceName(name);
          }}
        />
      )}
      <input type="hidden" name="lat" value={custom && pin ? pin.lat.toFixed(6) : ""} />
      <input type="hidden" name="lng" value={custom && pin ? pin.lng.toFixed(6) : ""} />
    </div>
  );
}

function PlacePicker({ pin, onPick }: { pin: Point | null; onPick: (point: Point, name?: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPickRef = useRef(onPick);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  // Create the little map once. Tap it, or drag the pin, to set the spot.
  const initialPin = useRef(pin);
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

  // Search as you type (after a short pause).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return; // the list is hidden below 3 letters
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

  function choose(result: SearchResult) {
    const map = mapRef.current;
    if (map && markerRef.current) {
      markerRef.current.setLngLat([result.point.lng, result.point.lat]).addTo(map);
      map.flyTo({ center: [result.point.lng, result.point.lat], zoom: 16 });
    }
    onPick(result.point, result.label);
    setResults(null);
    setQuery("");
  }

  return (
    <div className="space-y-2 rounded-2xl border border-line p-3">
      <div className="relative">
        <label htmlFor="place_search" className="label">Find the place</label>
        <input
          id="place_search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter picks the first result instead of submitting the whole form.
            if (e.key === "Enter") {
              e.preventDefault();
              if (results?.[0]) choose(results[0]);
            }
          }}
          placeholder="Search a pub, address or postcode"
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
      <div className="relative h-64 overflow-hidden rounded-xl bg-[#e9ebf0]">
        <div ref={containerRef} className="absolute inset-0" />
      </div>
      <p className={`text-sm ${pin ? "font-semibold text-ok" : "text-muted"}`}>
        {pin ? "✓ Pin placed. Drag it to adjust." : "Search above, or tap the map to drop a pin."}
      </p>
    </div>
  );
}
