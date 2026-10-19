import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  DEFAULT_UNI,
  LONDON_VIEW,
  WHEN_OPTIONS,
  campusView,
  distanceMetres,
  eventStatus,
  howFar,
  inWindow,
  isDark,
  loadMapEvents,
  mapsLink,
  normalise,
  timeFormat,
  uniById,
  walkText,
  walkingRoute,
  type Look,
  type MapEvent,
  type Walk,
  type When,
} from "@function/shared";
import { EventSheet, FilterPanel, RoundButton, SearchBar } from "@/components/map/controls";
import { LiveMap } from "@/components/map/Map";
import type { MapHandle } from "@/components/map/types";
import { Muted, T } from "@/components/ui";
import { WhatsOnList } from "@/components/whats-on-list";
import { whereAmI } from "@/lib/location";
import { isFiltering, useSavedCategories } from "@/lib/map-prefs";
import { useRefetchOnFocus } from "@/lib/use-refetch-on-focus";
import { useIsFocused } from "expo-router";
import { useProfile } from "@/lib/profile";
import { useMounted } from "@/lib/use-mounted";
import { supabase } from "@/lib/supabase";

type WalkInfo = { walk: Walk; title: string; note: string | null; maps: string };

// The live map: what's on now, tonight and tomorrow across London's unis.
// The map itself is drawn by the Map component (web or native); everything
// around it here is shared by both.
export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const home = uniById(profile?.university) ?? uniById(DEFAULT_UNI)!;
  const map = useRef<MapHandle>(null);
  const [mode, setMode] = useState<"map" | "list">("map");
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  // Events refresh every minute; "live" is checked every 30 seconds.

  const [now, setNow] = useState(() => Date.now());
  const focused = useIsFocused();
  const data = useQuery({ queryKey: ["map-events"], queryFn: () => loadMapEvents(supabase), refetchInterval: focused ? 60_000 : false });
  useRefetchOnFocus(data);
  useEffect(() => {
    if (!focused) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, [focused]);
  const events = data.data?.events ?? [];
  const windows = data.data?.windows;
  // Night colours from sunset to sunrise. The page is built in daylight, so
  // the switch waits until the screen is on (the web build is pre-rendered).
  const mounted = useMounted();
  const look: Look = mounted && isDark(new Date(now)) ? "night" : "day";

  const [when, setWhen] = useState<When>("tonight");
  const [categories, setCategories] = useSavedCategories();
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(true);
  const [selected, setSelected] = useState<MapEvent[] | null>(null);
  const [me, setMe] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [walk, setWalk] = useState<WalkInfo | null>(null);
  const [directionsState, setDirectionsState] = useState<string | null>(null);
  const [directionsError, setDirectionsError] = useState<string | null>(null);

  // Time, categories and search all combine.
  const categoryKey = categories.join(",");
  const filtering = isFiltering(categories);
  const filtered = useMemo(() => {
    if (!windows) return [];
    const chosen = categoryKey ? categoryKey.split(",") : [];
    return events.filter((e) => inWindow(e, when, windows, now) && (chosen.length === 0 || chosen.includes(e.category)));
  }, [events, when, windows, now, categoryKey]);
  const words = useMemo(() => normalise(query).split(" ").filter(Boolean), [query]);
  const visible = useMemo(
    () => (words.length === 0 ? filtered : filtered.filter((e) => words.every((w) => normalise(`${e.title} ${e.society} ${e.place}`).includes(w)))),
    [filtered, words],
  );
  const liveCount = visible.filter((e) => eventStatus(e, now) === "live").length;
  const nearest = useMemo(() => {
    if (!me || visible.length === 0) return null;
    return visible.map((e) => ({ event: e, metres: distanceMetres(me, [e.lng, e.lat]) })).sort((a, b) => a.metres - b.metres)[0];
  }, [me, visible]);

  async function findMe() {
    setLocationError(null);
    setLocating(true);
    try {
      setMe(await whereAmI());
    } catch (e) {
      setLocationError((e as Error).message);
    } finally {
      setLocating(false);
    }
  }

  function goTo(event: MapEvent) {
    map.current?.flyTo({ center: [event.lng, event.lat], zoom: 16.5 });
    setSelected([event]);
  }

  // Directions: find you, then the walking route; the card closes so the route can be seen.
  async function directions(event: MapEvent) {
    setDirectionsError(null);
    setDirectionsState("Finding you…");
    try {
      const from = me ?? (await whereAmI());
      setMe(from);
      setDirectionsState("Working out the route…");
      const to: [number, number] = [event.lng, event.lat];
      const route = await walkingRoute(from, to);
      setSelected(null);
      setWalk({
        walk: route,
        title: event.title,
        // Social events show a rough spot until you're going.
        note: event.href.startsWith("/social/") ? "To the rough area. The exact spot is on the event page once you're going." : null,
        maps: mapsLink(to),
      });
      map.current?.fitWalk(route);
    } catch (e) {
      setDirectionsError((e as Error).message);
    } finally {
      setDirectionsState(null);
    }
  }

  const whenLabel = WHEN_OPTIONS.find((o) => o.value === when)?.label.toLowerCase();
  const topPad = { paddingTop: insets.top + 12 };

  if (mode === "list") {
    return (
      <View className="flex-1 bg-bg">
        <WhatsOnList />
        <View className="absolute right-3" style={topPad}>
          <ModeButton mode="map" onPress={() => setMode("map")} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 overflow-hidden" style={{ backgroundColor: look === "night" ? "#171C27" : "#F7F6F2" }}>
      <LiveMap
        ref={map}
        events={visible}
        now={now}
        look={look}
        home={home.centre}
        me={me}
        walk={walk?.walk ?? null}
        onSelect={(picked) => {
          setDirectionsError(null);
          setSelected(picked);
        }}
        onReady={() => setReady(true)}
        onError={() => setMapError(true)}
      />

      {/* Top row: time, filter, search and list. Search replaces the row while open. */}
      <View className="absolute inset-x-0 top-0 z-20 px-3" style={topPad}>
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
          <View className="flex-row items-center justify-center gap-2">
            <View className="flex-row rounded-full border border-line bg-surface p-1 shadow-lg">
              {WHEN_OPTIONS.map((option) => {
                const on = when === option.value;
                return (
                  <Pressable key={option.value} onPress={() => setWhen(option.value)} accessibilityRole="button" accessibilityState={{ selected: on }} testID={`when-${option.value}`} className={`flex-row items-center rounded-full px-3 py-1.5 ${on ? "bg-brand" : ""}`}>
                    {option.value === "now" && <View className="mr-1.5 h-2 w-2 rounded-full bg-live" />}
                    <T variant="bold" className={`text-sm ${on ? "text-brand-ink" : "text-muted"}`}>{option.label}</T>
                  </Pressable>
                );
              })}
            </View>
            <View>
              <RoundButton icon="options-outline" label={filtering ? `Filter by category, ${categories.length} selected` : "Filter by category"} active={filterOpen || filtering} onPress={() => setFilterOpen((o) => !o)} testID="filter" />
              {filtering && (
                <View className="absolute -right-1 -top-1 min-w-5 items-center rounded-full bg-brand px-1">
                  <T variant="bold" className="text-[11px] leading-5 text-brand-ink">{categories.length}</T>
                </View>
              )}
              <FilterPanel open={filterOpen} selected={categories} onChange={setCategories} onClose={() => setFilterOpen(false)} />
            </View>
            <RoundButton
              icon="search"
              label="Search events"
              onPress={() => {
                setFilterOpen(false);
                setSearchOpen(true);
              }}
              testID="search"
            />
            <ModeButton mode="list" onPress={() => setMode("list")} />
          </View>
        )}

        {/* Search results, as you type */}
        {searchOpen && words.length > 0 && showResults && (
          <ScrollView className="mt-2 max-h-[45vh] rounded-2xl border border-line bg-surface shadow-xl" keyboardShouldPersistTaps="handled" testID="search-results">
            {visible.slice(0, 20).map((e, i) => (
              <Pressable
                key={e.id}
                onPress={() => {
                  setShowResults(false);
                  goTo(e);
                }}
                className={`px-4 py-2.5 ${i > 0 ? "border-t border-line" : ""}`}
                testID={`result-${e.id}`}
              >
                <View className="flex-row items-center gap-2">
                  {eventStatus(e, now) === "live" && (
                    <View className="rounded-full bg-live px-1.5">
                      <T variant="bold" className="text-[10px] text-white">LIVE</T>
                    </View>
                  )}
                  <T variant="semibold" numberOfLines={1} className="flex-1">{e.title}</T>
                </View>
                <Muted className="text-xs" numberOfLines={1}>{[e.society, timeFormat.format(new Date(e.startsAt)), e.place].filter(Boolean).join(" · ")}</Muted>
              </Pressable>
            ))}
            {visible.length === 0 && (
              <Muted className="px-4 py-3 text-sm">
                No {whenLabel} events match{filtering ? " your filters" : ""}. Try another time{filtering ? " or clear the filters" : ""}.
              </Muted>
            )}
          </ScrollView>
        )}
      </View>

      {/* Bottom: the count (or the walking route), and the uni / London buttons. */}
      {!selected && (
        <View className="absolute inset-x-0 bottom-0 z-10 flex-row items-end justify-between gap-2 p-3 web:pb-8" pointerEvents="box-none">
          {walk ? (
            <View className="max-w-[19rem] rounded-2xl border border-line bg-surface px-4 py-2.5 shadow-lg" testID="walk-bar">
              <Muted className="text-xs font-sans-semibold" numberOfLines={1}>Walking to {walk.title}</Muted>
              <T variant="display-bold" className="text-base">{walkText(walk.walk)}</T>
              {walk.note && <Muted className="text-xs">{walk.note}</Muted>}
              <View className="mt-1 flex-row gap-4">
                <Pressable onPress={() => Linking.openURL(walk.maps)}>
                  <T variant="bold" className="text-sm text-brand">Open in Maps</T>
                </Pressable>
                <Pressable onPress={() => setWalk(null)} testID="clear-route">
                  <T variant="bold" className="text-sm text-muted">Clear route</T>
                </Pressable>
              </View>
            </View>
          ) : (
            <View className="rounded-2xl border border-line bg-surface px-4 py-2.5 shadow-lg" testID="status">
              <T variant="bold" className="text-sm">
                {data.isPending ? "Loading…" : `${visible.length} ${visible.length === 1 ? "event" : "events"}`}
                {liveCount > 0 && <T variant="bold" className="text-sm text-live"> · {liveCount} live</T>}
              </T>
              {data.isError && <T variant="semibold" className="text-xs text-danger">Couldn&apos;t load events. Check your connection.</T>}
              {data.data && visible.length === 0 && (
                <Muted className="text-xs">
                  {words.length ? "Nothing matches your search." : filtering ? "Nothing in your chosen categories. Change the filter." : when === "now" ? "Nothing on right now. Try Tonight." : "Nothing posted yet. Check back soon."}
                </Muted>
              )}
              {nearest ? (
                <Pressable onPress={() => goTo(nearest.event)} className="mt-0.5 max-w-52" testID="nearest">
                  <Muted className="text-xs">
                    Nearest: <T variant="semibold" className="text-xs text-brand">{nearest.event.title}</T> · {howFar(nearest.metres)}
                  </Muted>
                </Pressable>
              ) : (
                !me && (
                  <Pressable onPress={findMe} disabled={locating} className="mt-0.5" testID="find-me">
                    <T variant="semibold" className="text-xs text-brand">{locating ? "Finding you…" : "Show what's near me"}</T>
                  </Pressable>
                )
              )}
              {locationError && <T className="mt-1 max-w-52 text-xs text-danger">{locationError}</T>}
            </View>
          )}
          <View className="mr-12 flex-row gap-2">
            <Pressable onPress={() => map.current?.flyTo(campusView(home.centre))} className="rounded-xl border border-line bg-surface px-3 py-2 shadow-lg" testID="go-uni">
              <T variant="bold" className="text-sm">{home.short}</T>
            </Pressable>
            <Pressable onPress={() => map.current?.flyTo(LONDON_VIEW)} className="rounded-xl border border-line bg-surface px-3 py-2 shadow-lg" testID="go-london">
              <T variant="bold" className="text-sm">London</T>
            </Pressable>
          </View>
        </View>
      )}

      {selected && <EventSheet events={selected} now={now} me={me} onClose={() => setSelected(null)} onDirections={directions} directionsState={directionsState} error={directionsError} />}

      {mapError && (
        <View className="absolute inset-x-0 top-1/2 mx-auto -translate-y-1/2 items-center self-center rounded-2xl border border-line bg-surface px-5 py-4 shadow-lg">
          <T variant="bold">The map couldn&apos;t load</T>
          <Muted className="text-sm">Check your internet connection and try again.</Muted>
        </View>
      )}
      {!ready && !mapError && data.isPending && (
        <View className="absolute inset-x-0 top-1/2 items-center" pointerEvents="none">
          <Muted className="text-sm">Loading the map…</Muted>
        </View>
      )}
    </View>
  );
}

// Switch between the map and the list.
function ModeButton({ mode, onPress }: { mode: "map" | "list"; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={`show-${mode}`} className="h-10 flex-row items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 shadow-lg">
      <T variant="bold" className="text-sm">{mode === "map" ? "Map" : "List"}</T>
    </Pressable>
  );
}
