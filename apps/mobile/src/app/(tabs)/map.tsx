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
  isPersonalFiltering,
  loadMapEvents,
  mapLand,
  mapsLink,
  matchesPersonalFilters,
  normalise,
  personalFilterCount,
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
import { Frosted, Muted, T } from "@/components/ui";
import { WhatsOnList } from "@/components/whats-on-list";
import { useFilterContext } from "@/lib/filter-context";
import { buttonTap, selectionTap } from "@/lib/haptics";
import { whereAmI } from "@/lib/location";
import { isFiltering, useSavedCategories } from "@/lib/map-prefs";
import { usePersonalFilters } from "@/lib/personal-filters";
import { useRefetchOnFocus } from "@/lib/use-refetch-on-focus";
import { useIsFocused } from "expo-router";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";
import { useSession } from "@/providers/session";

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
    // Refresh the clock when the tab comes back into view (intentional; React Compiler skips this effect).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, [focused]);
  const events = data.data?.events ?? [];
  const windows = data.data?.windows;
  // The light or dark map, following the phone's light or dark mode.
  const { dark } = useTheme();
  const look: Look = dark ? "night" : "day";

  const [when, setWhen] = useState<When>("tonight");
  const [categories, setCategories] = useSavedCategories();
  // The personal boxes (friends hosting / my societies) only mean something logged in.
  const { session } = useSession();
  const [personal, setPersonal] = usePersonalFilters();
  const { context: who, ready: whoReady } = useFilterContext();
  const personalOn = !!session && whoReady && isPersonalFiltering(personal);
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

  // Time, categories, the personal boxes and search all combine.
  const categoryKey = categories.join(",");
  const filtering = isFiltering(categories) || personalOn;
  const filterCount = (isFiltering(categories) ? categories.length : 0) + (personalOn ? personalFilterCount(personal) : 0);
  const filtered = useMemo(() => {
    if (!windows) return [];
    const chosen = categoryKey ? categoryKey.split(",") : [];
    return events.filter((e) => inWindow(e, when, windows, now) && (chosen.length === 0 || chosen.includes(e.category)) && (!personalOn || matchesPersonalFilters(e, who, personal)));
  }, [events, when, windows, now, categoryKey, personalOn, who, personal]);
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
    <View className="flex-1 overflow-hidden" style={{ backgroundColor: mapLand(look) }}>
      <LiveMap
        ref={map}
        events={visible}
        now={now}
        look={look}
        home={home.centre}
        me={me}
        walk={walk?.walk ?? null}
        onSelect={(picked) => {
          selectionTap();
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
          <View className="flex-row items-center justify-center gap-1.5">
            <View className="rounded-full shadow-soft">
              <Frosted className="h-10 flex-row items-center rounded-full p-1">
                {WHEN_OPTIONS.map((option) => {
                  const on = when === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => {
                        if (!on) selectionTap();
                        setWhen(option.value);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      testID={`when-${option.value}`}
                      className={`h-8 flex-row items-center rounded-full px-2.5 ${on ? "bg-brand" : ""}`}
                    >
                      {option.value === "now" && <View className={`mr-1 h-1.5 w-1.5 rounded-full ${on ? "bg-brand-ink" : "bg-live"}`} />}
                      <T className={`text-[14px] leading-[18px] font-sans-semibold ${on ? "text-brand-ink" : "text-ink"}`}>{option.label}</T>
                    </Pressable>
                  );
                })}
              </Frosted>
            </View>
            <View>
              <RoundButton icon="options-outline" label={filtering ? `Filter events, ${filterCount} selected` : "Filter events"} active={filterOpen || filtering} onPress={() => setFilterOpen((o) => !o)} testID="filter" />
              {filtering && (
                <View className="absolute -right-1 -top-1 min-w-5 items-center rounded-full bg-brand px-1" testID="filter-count">
                  <T variant="bold" className="text-[11px] leading-5 text-brand-ink">{filterCount}</T>
                </View>
              )}
              <FilterPanel open={filterOpen} selected={categories} onChange={setCategories} onClose={() => setFilterOpen(false)} personal={session ? personal : undefined} onPersonalChange={session ? setPersonal : undefined} />
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
          <Frosted className="mt-2 rounded-2xl">
          <ScrollView className="max-h-[45vh]" keyboardShouldPersistTaps="handled" testID="search-results">
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
                      <T variant="caption2" className="text-white">LIVE</T>
                    </View>
                  )}
                  <T variant="headline" numberOfLines={1} className="flex-1">{e.title}</T>
                </View>
                <T variant="footnote" className="text-muted" numberOfLines={1}>{[e.society, timeFormat.format(new Date(e.startsAt)), e.place].filter(Boolean).join(" · ")}</T>
              </Pressable>
            ))}
            {visible.length === 0 && (
              <Muted className="px-4 py-3 text-sm">
                No {whenLabel} events match{filtering ? " your filters" : ""}. Try another time{filtering ? " or clear the filters" : ""}.
              </Muted>
            )}
          </ScrollView>
          </Frosted>
        )}
      </View>

      {/* Bottom: the count (or the walking route), and the uni / London buttons. */}
      {!selected && (
        <View className="absolute inset-x-0 bottom-0 z-10 p-3 web:pb-8" pointerEvents="box-none">
          {/* One line: the count (or the walking route) on the left, and your
              uni and all of London on the right, lined up along the bottom. */}
          <View className="mr-12 flex-row items-end gap-2" pointerEvents="box-none" testID="map-bottom-row">
          {walk ? (
            <View className="min-w-0 shrink rounded-2xl shadow-soft">
            <Frosted className="rounded-2xl px-4 py-3" testID="walk-bar">
              <T variant="footnote" className="font-sans-semibold text-muted" numberOfLines={1}>Walking to {walk.title}</T>
              <T variant="headline">{walkText(walk.walk)}</T>
              {walk.note && <T variant="footnote" className="text-muted">{walk.note}</T>}
              <View className="mt-1 flex-row gap-4">
                <Pressable onPress={() => Linking.openURL(walk.maps)}>
                  <T variant="subhead" className="font-sans-semibold text-brand">Open in Maps</T>
                </Pressable>
                <Pressable onPress={() => setWalk(null)} testID="clear-route">
                  <T variant="subhead" className="font-sans-semibold text-muted">Clear route</T>
                </Pressable>
              </View>
            </Frosted>
            </View>
          ) : (
            <View className="min-w-0 shrink rounded-2xl shadow-soft">
            <Frosted className="rounded-2xl px-4 py-3" testID="status">
              <T variant="headline">
                {data.isPending ? "Loading…" : `${visible.length} ${visible.length === 1 ? "event" : "events"} ${whenLabel}`}
                {liveCount > 0 && <T variant="headline" className="text-live"> · {liveCount} live</T>}
              </T>
              {data.isError && <T variant="footnote" className="font-sans-semibold text-danger">Couldn&apos;t load events. Check your connection.</T>}
              {data.data && visible.length === 0 && (
                <Muted className="text-[13px] leading-[18px]">
                  {words.length ? "Nothing matches your search." : personalOn ? "Nothing matches your filters. Untick a box to see more." : filtering ? "Nothing in your chosen categories. Change the filter." : when === "now" ? "Nothing on right now. Try Tonight." : "Nothing posted yet. Check back soon."}
                </Muted>
              )}
              {nearest ? (
                <Pressable onPress={() => goTo(nearest.event)} className="mt-0.5 max-w-52" testID="nearest">
                  <Muted className="text-[13px] leading-[18px]">
                    Nearest: <T variant="footnote" className="font-sans-semibold text-brand">{nearest.event.title}</T> · {howFar(nearest.metres)}
                  </Muted>
                </Pressable>
              ) : (
                !me && (
                  <Pressable
                    onPress={() => {
                      buttonTap();
                      void findMe();
                    }}
                    disabled={locating}
                    className="mt-0.5"
                    testID="find-me"
                  >
                    <T variant="footnote" className="font-sans-semibold text-brand">{locating ? "Finding you…" : "Show what's near me"}</T>
                  </Pressable>
                )
              )}
              {locationError && <T variant="footnote" className="mt-1 max-w-52 text-danger">{locationError}</T>}
            </Frosted>
            </View>
          )}
            <View className="ml-auto flex-none flex-row gap-2" pointerEvents="box-none">
              <PlaceButton label={home.short} onPress={() => map.current?.flyTo(campusView(home.centre))} testID="go-uni" />
              <PlaceButton label="London" onPress={() => map.current?.flyTo(LONDON_VIEW)} testID="go-london" />
            </View>
          </View>
        </View>
      )}

      {selected && <EventSheet events={selected} now={now} me={me} onClose={() => setSelected(null)} onDirections={directions} directionsState={directionsState} error={directionsError} />}

      {mapError && (
        <View className="absolute inset-x-0 top-1/2 -translate-y-1/2 items-center">
          <Frosted className="items-center rounded-2xl px-5 py-4">
            <T variant="headline">The map couldn&apos;t load</T>
            <T variant="footnote" className="text-muted">Check your internet connection and try again.</T>
          </Frosted>
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
    <Pressable
      onPress={() => {
        buttonTap();
        onPress();
      }}
      accessibilityRole="button"
      testID={`show-${mode}`}
      className="rounded-full shadow-soft active:opacity-80"
    >
      <Frosted className="h-10 flex-row items-center rounded-full px-3.5">
        <T className="text-[14px] leading-[18px] font-sans-semibold">{mode === "map" ? "Map" : "List"}</T>
      </Frosted>
    </Pressable>
  );
}

// Jump to your uni or all of London.
function PlaceButton({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable
      onPress={() => {
        buttonTap();
        onPress();
      }}
      accessibilityRole="button"
      testID={testID}
      className="rounded-full shadow-soft active:opacity-80"
    >
      <Frosted className="h-10 justify-center rounded-full px-4">
        <T className="text-[14px] leading-[18px] font-sans-semibold">{label}</T>
      </Frosted>
    </Pressable>
  );
}
