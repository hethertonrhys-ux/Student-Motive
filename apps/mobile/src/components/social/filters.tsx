import { useState } from "react";
import { Pressable, View } from "react-native";
import { SOCIAL_CATEGORIES, personalFilterCount, type DiscoverFilters, type PersonalFilters, type SocialCategory } from "@function/shared";
import { DateField } from "@/components/fields/date-time";
import { Icon } from "@/components/icon";
import { PersonalFilterBoxes } from "@/components/personal-filters";
import { Input, Muted, T } from "@/components/ui";

type Menu = "category" | "date" | "type" | null;

export const EMPTY_FILTERS: DiscoverFilters = { categories: [], date: "", type: "", available: false, q: "" };

// Discover search and filters. Only the search bar shows until you tap it;
// then the filters appear underneath. Changing them doesn't ask the
// database: the list underneath narrows straight away.
export function Filters({ filters, onChange, personal, onPersonalChange }: { filters: DiscoverFilters; onChange: (next: DiscoverFilters) => void; personal?: PersonalFilters; onPersonalChange?: (next: PersonalFilters) => void }) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<Menu>(null);
  const { categories, date, type, available, q } = filters;
  const picked = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
  const personalCount = personal ? personalFilterCount(personal) : 0;
  const filterCount = [categories.length, date, type, available].filter(Boolean).length + personalCount;
  const set = (changes: Partial<DiscoverFilters>) => onChange({ ...filters, ...changes });
  const clearFilters = () => {
    set({ categories: [], date: "", type: "", available: false });
    if (personal && onPersonalChange && personalCount) onPersonalChange({ friendsHosting: false, mySocieties: false });
  };
  const close = () => {
    setOpen(false);
    setMenu(null);
  };
  const categoryLabel = categories.length === 1 ? SOCIAL_CATEGORIES.find((c) => c.value === categories[0])?.label : categories.length > 1 ? `${categories.length} categories` : undefined;
  const toggleCategory = (value: SocialCategory) => set({ categories: categories.includes(value) ? categories.filter((c) => c !== value) : [...categories, value] });
  const dateLabel = date === "today" ? "Today" : date === "week" ? "This week" : picked ? new Date(`${picked}T12:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
  const typeLabel = type === "open" ? "Open only" : type === "private" ? "Private only" : "";
  const pick = (changes: Partial<DiscoverFilters>) => {
    set(changes);
    setMenu(null);
  };

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <View className="relative min-w-0 flex-1">
          <View className="pointer-events-none absolute left-3.5 top-0 z-10 h-full justify-center">
            <Icon name="search" size={20} color="#5e5d78" />
          </View>
          <Input value={q} onChangeText={(v) => set({ q: v })} onFocus={() => setOpen(true)} placeholder="Search events" accessibilityLabel="Search events by name or place" className={`pl-11 ${!open && filterCount ? "pr-32" : ""}`} testID="social-search" />
          {/* Filters still on after closing: say so, with a quick way to clear them. */}
          {!open && filterCount > 0 && (
            <View className="absolute right-2 top-0 h-full flex-row items-center">
              <Pressable onPress={() => setOpen(true)} className="rounded-l-full bg-brand-soft py-1.5 pl-3 pr-1">
                <T variant="bold" className="text-xs text-brand">{filterCount} {filterCount === 1 ? "filter" : "filters"}</T>
              </Pressable>
              <Pressable onPress={clearFilters} accessibilityLabel="Clear filters" className="h-7 w-7 items-center justify-center rounded-r-full bg-brand-soft" testID="clear-filters">
                <Icon name="close" size={16} color="#DA291C" />
              </Pressable>
            </View>
          )}
        </View>
        {open && (
          <Pressable onPress={close} className="px-1" testID="filters-done">
            <T variant="semibold" className="text-sm text-brand">Done</T>
          </Pressable>
        )}
      </View>

      {open && (
        <View className="gap-3" testID="filters">
          <View className="flex-row flex-wrap gap-2">
            <Chip active={categories.length > 0} onPress={() => setMenu(menu === "category" ? null : "category")} testID="menu-category">{categoryLabel ?? "Category"}</Chip>
            <Chip active={Boolean(date)} onPress={() => setMenu(menu === "date" ? null : "date")} testID="menu-date">{dateLabel || "Date"}</Chip>
            <Chip active={Boolean(type)} onPress={() => setMenu(menu === "type" ? null : "type")} testID="menu-type">{typeLabel || "Open/Private"}</Chip>
            <Chip active={available} onPress={() => set({ available: !available })} testID="filter-available">Spaces available</Chip>
          </View>
          {menu === "category" && (
            <View className="flex-row flex-wrap gap-2 rounded-2xl border border-line bg-surface p-3">
              <Chip active={categories.length === 0} onPress={() => pick({ categories: [] })}>All</Chip>
              {SOCIAL_CATEGORIES.map((c) => (
                <Chip key={c.value} active={categories.includes(c.value)} onPress={() => toggleCategory(c.value)} testID={`cat-${c.value}`}>{c.label}</Chip>
              ))}
            </View>
          )}
          {menu === "date" && (
            <View className="flex-row flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3">
              <Chip active={!date} onPress={() => pick({ date: "" })}>Any day</Chip>
              <Chip active={date === "today"} onPress={() => pick({ date: "today" })} testID="date-today">Today</Chip>
              <Chip active={date === "week"} onPress={() => pick({ date: "week" })}>This week</Chip>
              <View className="w-40">
                <DateField value={picked} onChange={(v) => pick({ date: v })} accessibilityLabel="Pick a date" />
              </View>
            </View>
          )}
          {menu === "type" && (
            <View className="flex-row flex-wrap gap-2 rounded-2xl border border-line bg-surface p-3">
              <Chip active={!type} onPress={() => pick({ type: "" })}>Both</Chip>
              <Chip active={type === "open"} onPress={() => pick({ type: "open" })} testID="type-open">Open only</Chip>
              <Chip active={type === "private"} onPress={() => pick({ type: "private" })}>Private only</Chip>
            </View>
          )}
          {personal && onPersonalChange && (
            <View className="rounded-2xl border border-line bg-surface px-2 py-1">
              <PersonalFilterBoxes filters={personal} onChange={onPersonalChange} compact testID="social-personal" />
            </View>
          )}
          {filterCount > 0 && (
            <Pressable onPress={clearFilters}>
              <T variant="semibold" className="text-sm text-brand">Clear filters</T>
            </Pressable>
          )}
        </View>
      )}
      {filterCount === 0 && open && <Muted className="text-xs">Tip: tick a few categories, or just search.</Muted>}
    </View>
  );
}

export function Chip({ children, active, onPress, testID }: { children: string; active: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityState={{ selected: active }} testID={testID} className={`rounded-full border px-3.5 py-1.5 ${active ? "border-brand bg-brand" : "border-line bg-surface"}`}>
      <T variant="semibold" className={`text-sm ${active ? "text-brand-ink" : ""}`}>{children}</T>
    </Pressable>
  );
}
