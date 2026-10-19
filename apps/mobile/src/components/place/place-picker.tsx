import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { LSE, searchAddresses, searchLsePlaces, type PlaceResult } from "@function/shared";
import { Input, Muted, T } from "@/components/ui";
import { PlaceMap, type PlaceMapHandle, type Point } from "./place-map";

export type { Point };

// Search for a place and/or tap the map to drop a pin. LSE buildings, halls
// and theatres come first (from our own list, instantly), then addresses
// from Photon (built on OpenStreetMap). "centre" is where the map starts.
export function PlacePicker({ pin, onPick, centre = LSE }: { pin: Point | null; onPick: (point: Point, name?: string, detail?: string) => void; centre?: [number, number] }) {
  const map = useRef<PlaceMapHandle>(null);
  const [query, setQuery] = useState("");
  // The place chosen from the list stays in the box, so it's clear it's set.
  const [chosen, setChosen] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<PlaceResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  const typing = query.trim().length >= 2 && query !== chosen;
  const lse: PlaceResult[] = typing ? searchLsePlaces(query).map((p) => ({ label: p.name, detail: p.detail, point: { lng: p.at[0], lat: p.at[1] } })) : [];

  // Look up addresses as you type (after a short pause).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || query === chosen) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(false);
      try {
        setAddresses(await searchAddresses(q, centre, controller.signal));
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
  }, [query, chosen, centre]);

  const shownAddresses = query.trim().length >= 3 ? (addresses ?? []).filter((a) => !lse.some((l) => l.label === a.label)) : [];
  const results = [...lse, ...shownAddresses];

  function choose(r: PlaceResult) {
    map.current?.flyTo(r.point);
    onPick(r.point, r.label, r.detail);
    setQuery(r.label);
    setChosen(r.label);
    setAddresses(null);
  }

  return (
    <View className="gap-2">
      <View className="relative z-10">
        <Input
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            if (chosen) setChosen(null);
          }}
          onSubmitEditing={() => typing && results[0] && choose(results[0])}
          placeholder="Search a building, place, address or postcode"
          accessibilityLabel="Search for the place"
          autoCorrect={false}
          className={chosen ? "border-ok font-sans-semibold" : ""}
          testID="place-search"
        />
        {typing && (results.length > 0 || searching || searchError || query.trim().length >= 3) && (
          <View className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-hidden rounded-xl border border-line bg-surface shadow-xl" testID="place-results">
            {results.map((r, i) => (
              <Pressable key={`${r.label}-${i}`} onPress={() => choose(r)} className={`px-3 py-2.5 ${i > 0 ? "border-t border-line" : ""}`} testID={`place-${i}`}>
                <T variant="semibold">{r.label}</T>
                {!!r.detail && <Muted className="text-xs">{r.detail}</Muted>}
              </Pressable>
            ))}
            {searching && shownAddresses.length === 0 && <Muted className="px-3 py-2.5 text-sm">Searching…</Muted>}
            {searchError && lse.length === 0 && <T className="px-3 py-2.5 text-sm text-danger">Search isn&apos;t working right now. Tap the map instead.</T>}
            {!searching && !searchError && results.length === 0 && addresses && <Muted className="px-3 py-2.5 text-sm">No matches. Try a postcode, or tap the map.</Muted>}
          </View>
        )}
      </View>
      <PlaceMap ref={map} centre={centre} pin={pin} onPick={(p) => onPick(p)} />
      <T className={`text-sm ${pin ? "font-sans-semibold text-ok" : "text-muted"}`}>{pin ? "✓ Pin placed. Tap the map to adjust." : "Search above, or tap the map to drop a pin."}</T>
    </View>
  );
}
