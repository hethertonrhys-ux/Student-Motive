"use client";

import { useState } from "react";
import { PlacePicker, type Point } from "@/components/place-picker";
import type { MotiveEvent, Venue } from "@/lib/types";

const VENUE_GROUPS: { kind: Venue["kind"]; label: string }[] = [
  { kind: "campus", label: "LSE campus" },
  { kind: "hall", label: "LSE halls" },
  { kind: "university", label: "Other universities" },
  { kind: "club", label: "Clubs & bars" },
  { kind: "other", label: "Other" },
];

export const CUSTOM_PLACE = "custom";

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
          label="Find the place"
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
