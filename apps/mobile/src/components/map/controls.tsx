import type Ionicons from "@expo/vector-icons/Ionicons";
import { Link } from "expo-router";
import { useMemo } from "react";
import { Modal, PanResponder, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions } from "react-native";
import Animated, { SlideInDown, SlideOutDown, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CATEGORY_STYLE, MAP_CATEGORIES, type MapCategory, type MapEvent, type PersonalFilters, distanceMetres, eventStatus, howFar, isPersonalFiltering, mapCategoryLabel, personalFilterCount, timeFormat } from "@function/shared";
import { Button, Frosted, Muted, T } from "@/components/ui";
import { Icon } from "@/components/icon";
import { PersonalFilterBoxes } from "@/components/personal-filters";
import { buttonTap } from "@/lib/haptics";
import { usePlaceholderColor, useTheme } from "@/lib/theme";
import { PIN_ICON } from "./types";

// The things you tap on around the map: the filter panel, the search bar
// and the event cards. Plain React Native, so they're the same on the web
// and on the phone. They float over the map on frosted glass (Frosted),
// like Snap Map's controls, and give a little tap you can feel on phones.

// A round frosted button with an icon (filter, search).
export function RoundButton({ icon, label, active, onPress, testID }: { icon: keyof typeof Ionicons.glyphMap; label: string; active?: boolean; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        buttonTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      className="rounded-full shadow-soft active:opacity-80"
    >
      <Frosted className={`h-10 w-10 items-center justify-center rounded-full ${active ? "border-2 border-brand" : ""}`}>
        <Icon name={icon} size={20} color={active ? colors.brand : colors.ink} />
      </Frosted>
    </Pressable>
  );
}

export function FilterPanel({ open, selected, onChange, onClose, personal, onPersonalChange }: { open: boolean; selected: MapCategory[]; onChange: (next: MapCategory[]) => void; onClose: () => void; personal?: PersonalFilters; onPersonalChange?: (next: PersonalFilters) => void }) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const top = insets.top + 12 + 44 + 8;
  const toggle = (value: MapCategory) => onChange(selected.includes(value) ? selected.filter((c) => c !== value) : [...selected, value]);
  // A modal sits above the map and its pins on every platform, so the panel
  // is solid and nothing shows through it. Tapping outside closes it.
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="Close filters" onPress={onClose} className="flex-1 bg-black/20" />
      {/* Short screens: the list scrolls, the heading and Done stay put. */}
      <View accessibilityRole="none" className="absolute right-3 w-72 max-w-[calc(100%-24px)] rounded-2xl border border-line bg-surface p-2 shadow-soft" style={{ top, maxHeight: Math.max(240, windowHeight - top - 16), ...(Platform.OS === "web" ? { boxShadow: "0 8px 24px rgba(0,0,0,0.16)" } : null) }} testID="filter-panel">
        <ScrollView className="shrink" bounces={false} keyboardShouldPersistTaps="handled">
        {personal && onPersonalChange && (
          <View className="border-b border-line px-0 pb-2 pt-1">
            <T variant="headline" className="px-2 pb-1">Just for me</T>
            <PersonalFilterBoxes filters={personal} onChange={onPersonalChange} testID="filter-personal" />
          </View>
        )}
        <View className="flex-row items-center justify-between px-2 pb-2 pt-1">
          <T variant="headline">Categories</T>
          <View className="flex-row gap-3">
            <Pressable onPress={() => onChange(MAP_CATEGORIES.map((c) => c.value))}>
              <T variant="semibold" className="text-sm text-brand">Select all</T>
            </Pressable>
            <Pressable onPress={() => onChange([])}>
              <T variant="semibold" className="text-sm text-muted">Clear</T>
            </Pressable>
          </View>
        </View>
        <View className="border-y border-line py-1">
          {MAP_CATEGORIES.map((c) => {
            const on = selected.includes(c.value);
            return (
              <Pressable key={c.value} onPress={() => toggle(c.value)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} aria-checked={on} testID={`filter-${c.value}`} className="flex-row items-center gap-3 rounded-xl px-2 py-2.5">
                <View className={`h-5 w-5 items-center justify-center rounded-md border ${on ? "border-brand bg-brand" : "border-line bg-surface"}`}>{on && <Icon name="checkmark" size={14} color="#fff" />}</View>
                <T variant="semibold">{c.label}</T>
              </Pressable>
            );
          })}
        </View>
        </ScrollView>
        <View className="flex-row items-center justify-between gap-2 px-2 pt-2">
          <Muted className="text-xs">{selected.length === 0 && !(personal && isPersonalFiltering(personal)) ? "Nothing ticked: showing everything" : `${selected.length} selected${personal && isPersonalFiltering(personal) ? ` · ${personalFilterCount(personal)} just for me` : ""}`}</Muted>
          <Button onPress={onClose} className="py-1.5" testID="filter-done">Done</Button>
        </View>
      </View>
    </Modal>
  );
}

export function SearchBar({ value, onChange, onCancel }: { value: string; onChange: (v: string) => void; onCancel: () => void }) {
  const placeholder = usePlaceholderColor();
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-2">
      <Frosted className="relative flex-1 rounded-full">
        <View className="pointer-events-none absolute left-3.5 top-0 h-11 justify-center">
          <Icon name="search" size={19} color={colors.muted} />
        </View>
        <TextInput
          value={value}
          onChangeText={onChange}
          autoFocus
          returnKeyType="search"
          placeholder="Event, society or place"
          placeholderTextColor={placeholder}
          accessibilityLabel="Search events by name, society or place"
          testID="search-input"
          className="h-11 w-full rounded-full bg-transparent pl-11 pr-10 font-sans text-[17px] text-ink web:outline-none"
        />
        {!!value && (
          <Pressable onPress={() => onChange("")} accessibilityLabel="Clear search" className="absolute right-2 top-2 h-7 w-7 items-center justify-center rounded-full">
            <Icon name="close-circle" size={20} color={colors.muted} />
          </Pressable>
        )}
      </Frosted>
      <Pressable onPress={onCancel} className="h-11 justify-center px-1" testID="search-cancel">
        <T variant="headline" className="text-brand">Cancel</T>
      </Pressable>
    </View>
  );
}

// One event's card: what, who by, when and where, how many are going.
export function EventCard({ event, now, me, onDirections, directionsState }: { event: MapEvent; now: number; me: [number, number] | null; onDirections?: (event: MapEvent) => void; directionsState?: string | null }) {
  const s = eventStatus(event, now);
  const { colour } = CATEGORY_STYLE[event.category];
  const when = s === "live" ? `Until ${timeFormat.format(new Date(event.endsAt))}` : `${timeFormat.format(new Date(event.startsAt))}–${timeFormat.format(new Date(event.endsAt))}`;
  return (
    <View className="py-2" testID={`card-${event.id}`}>
      <View className="flex-row items-center gap-1.5">
        {s === "live" && (
          <View className="rounded-full bg-live px-2 py-0.5">
            <T variant="bold" className="text-[11px] text-white">LIVE</T>
          </View>
        )}
        <View className="flex-row items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: `${colour}1f` }}>
          <Icon name={PIN_ICON[event.category] as never} size={13} color={colour} />
          <T variant="bold" className="text-[11px]" style={{ color: colour }}>{mapCategoryLabel(event.category)}{event.freeFood ? " · Free food" : ""}</T>
        </View>
      </View>
      <T variant="title3" className="mt-1.5">{event.title}</T>
      {!!event.society && <T variant="subhead" className="font-sans-semibold text-brand">{event.society}</T>}
      <T variant="footnote" className="mt-1 text-muted">{when} · {event.place}</T>
      <T variant="footnote" className="mt-0.5 font-sans-semibold">{s === "live" ? `${event.going} there or going` : `${event.going} going`}</T>
      {me && <T variant="footnote" className="mt-0.5 text-muted">{howFar(distanceMetres(me, [event.lng, event.lat]))}</T>}
      <View className="mt-3 flex-row gap-2">
        <Link href={event.href as never} asChild>
          <Button className="flex-1 rounded-full" testID="view-details">View details</Button>
        </Link>
        {onDirections && (
          <Button variant="ghost" className="flex-1 flex-row items-center justify-center gap-1.5 rounded-full" onPress={() => onDirections(event)} disabled={!!directionsState} testID="directions">
            {directionsState ?? "Directions"}
          </Button>
        )}
      </View>
    </View>
  );
}

// Plain styles (not classes) on the animated view, the safest on every platform.
const SHEET = { position: "absolute", zIndex: 30, left: 12, right: 12, bottom: 12, maxHeight: "60%", borderRadius: 24, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 6 } as const;

// The card (or cards, for a group all in one place) over the bottom of the
// map: it slides up when you tap a pin, and you can swipe it down (or tap
// the cross) to close it, like an iOS sheet.
export function EventSheet({ events, now, me, onClose, onDirections, directionsState, error }: { events: MapEvent[]; now: number; me: [number, number] | null; onClose: () => void; onDirections: (event: MapEvent) => void; directionsState: string | null; error: string | null }) {
  const { colors } = useTheme();
  const drag = useSharedValue(0);
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drag.get() }] }));
  // Dragging the grabber (or the top of the card) down past 80 points closes it; less springs back.
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => {
          drag.set(Math.max(0, g.dy));
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > 80 || g.vy > 0.8) {
            drag.set(withTiming(500, { duration: 180 }));
            setTimeout(onClose, 180);
          } else drag.set(withSpring(0, { damping: 18, stiffness: 220 }));
        },
      }),
    [drag, onClose],
  );
  return (
    <Animated.View entering={SlideInDown.duration(260)} exiting={SlideOutDown.duration(180)} style={[SHEET, dragStyle]} testID="sheet">
      <Frosted className="max-h-full rounded-3xl px-4 pb-3">
        <View {...swipe.panHandlers} className="items-center pb-1 pt-2">
          <View className="h-1.5 w-9 rounded-full bg-muted/40" />
        </View>
        <Pressable
          onPress={() => {
            buttonTap();
            onClose();
          }}
          accessibilityLabel="Close"
          className="absolute right-3 top-3 z-10 h-8 w-8 items-center justify-center rounded-full bg-muted/15"
          testID="close-sheet"
        >
          <Icon name="close" size={18} color={colors.muted} />
        </Pressable>
        <ScrollView>
          {events.map((e, i) => (
            <View key={e.id} className={i > 0 ? "border-t border-line" : "pr-8"}>
              <EventCard event={e} now={now} me={me} onDirections={onDirections} directionsState={directionsState} />
            </View>
          ))}
          {error && <T variant="footnote" className="pb-2 font-sans-semibold text-danger">{error}</T>}
        </ScrollView>
      </Frosted>
    </Animated.View>
  );
}
