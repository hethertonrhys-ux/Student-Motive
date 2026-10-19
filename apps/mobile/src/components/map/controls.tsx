import type Ionicons from "@expo/vector-icons/Ionicons";
import { Link } from "expo-router";
import { Modal, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CATEGORY_STYLE, MAP_CATEGORIES, type MapCategory, type MapEvent, type PersonalFilters, distanceMetres, eventStatus, howFar, isPersonalFiltering, mapCategoryLabel, personalFilterCount, timeFormat } from "@function/shared";
import { Button, Muted, T } from "@/components/ui";
import { Icon } from "@/components/icon";
import { PersonalFilterBoxes } from "@/components/personal-filters";
import { usePlaceholderColor, useTheme } from "@/lib/theme";
import { PIN_ICON } from "./types";

// The things you tap on around the map: the filter panel, the search bar
// and the event cards. Plain React Native, so they're the same on the web
// and on the phone.

// A round button with an icon (filter, search, list).
export function RoundButton({ icon, label, active, onPress, testID }: { icon: keyof typeof Ionicons.glyphMap; label: string; active?: boolean; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      className={`h-10 w-10 items-center justify-center rounded-full border shadow-lg ${active ? "border-brand bg-brand-soft" : "border-line bg-surface"}`}
    >
      <Icon name={icon} size={22} color={active ? colors.brand : colors.ink} />
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
      <View accessibilityRole="none" className="absolute right-3 w-72 max-w-[calc(100%-24px)] rounded-2xl border border-line bg-surface p-2 shadow-xl" style={{ top, maxHeight: Math.max(240, windowHeight - top - 16), ...(Platform.OS === "web" ? { boxShadow: "0 12px 32px rgba(0,0,0,0.25)" } : null) }} testID="filter-panel">
        <ScrollView className="shrink" bounces={false} keyboardShouldPersistTaps="handled">
        {personal && onPersonalChange && (
          <View className="border-b border-line px-0 pb-2 pt-1">
            <T variant="display-bold" className="px-2 pb-1">Just for me</T>
            <PersonalFilterBoxes filters={personal} onChange={onPersonalChange} testID="filter-personal" />
          </View>
        )}
        <View className="flex-row items-center justify-between px-2 pb-2 pt-1">
          <T variant="display-bold">Categories</T>
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
  return (
    <View className="flex-row items-center gap-2">
      <View className="relative flex-1">
        <View className="pointer-events-none absolute left-3.5 top-0 h-11 justify-center">
          <Icon name="search" size={20} color="#5e5d78" />
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
          className="h-11 w-full rounded-full border border-line bg-surface pl-11 pr-10 font-sans text-base text-ink shadow-lg web:outline-none web:focus:border-brand"
        />
        {!!value && (
          <Pressable onPress={() => onChange("")} accessibilityLabel="Clear search" className="absolute right-2 top-2 h-7 w-7 items-center justify-center rounded-full">
            <Icon name="close" size={20} color="#5e5d78" />
          </Pressable>
        )}
      </View>
      <Pressable onPress={onCancel} className="rounded-full bg-surface px-3.5 py-2.5 shadow-lg" testID="search-cancel">
        <T variant="bold" className="text-sm">Cancel</T>
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
      <T variant="display-bold" className="mt-1 text-base leading-5">{event.title}</T>
      {!!event.society && <T variant="semibold" className="text-[13px] text-brand">{event.society}</T>}
      <Muted className="mt-1 text-xs">{when} · {event.place}</Muted>
      <T variant="bold" className="mt-1 text-xs">{s === "live" ? `${event.going} there or going` : `${event.going} going`}</T>
      {me && <Muted className="mt-1 text-xs">{howFar(distanceMetres(me, [event.lng, event.lat]))}</Muted>}
      <View className="mt-2.5 flex-row gap-2">
        <Link href={event.href as never} asChild>
          <Button className="flex-1 py-2" testID="view-details">View details</Button>
        </Link>
        {onDirections && (
          <Button variant="ghost" className="flex-1 flex-row items-center justify-center gap-1.5 py-2" onPress={() => onDirections(event)} disabled={!!directionsState} testID="directions">
            {directionsState ?? "Directions"}
          </Button>
        )}
      </View>
    </View>
  );
}

// The card (or cards, for a group all in one place) over the bottom of the map.
export function EventSheet({ events, now, me, onClose, onDirections, directionsState, error }: { events: MapEvent[]; now: number; me: [number, number] | null; onClose: () => void; onDirections: (event: MapEvent) => void; directionsState: string | null; error: string | null }) {
  const { colors } = useTheme();
  return (
    <View className="absolute inset-x-3 bottom-3 max-h-[60%] rounded-2xl border border-line bg-surface px-4 pb-2 pt-1 shadow-xl" testID="sheet">
      <Pressable onPress={onClose} accessibilityLabel="Close" className="absolute right-2 top-2 z-10 h-8 w-8 items-center justify-center rounded-full" testID="close-sheet">
        <Icon name="close" size={22} color={colors.ink} />
      </Pressable>
      <ScrollView>
        {events.map((e, i) => (
          <View key={e.id} className={i > 0 ? "border-t border-line" : "pr-8"}>
            <EventCard event={e} now={now} me={me} onDirections={onDirections} directionsState={directionsState} />
          </View>
        ))}
        {error && <T variant="semibold" className="pb-2 text-sm text-danger">{error}</T>}
      </ScrollView>
    </View>
  );
}
