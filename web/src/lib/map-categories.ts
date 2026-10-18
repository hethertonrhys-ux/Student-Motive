import { CATEGORIES, type EventCategory } from "@/lib/types";
import type { SocialCategory } from "@/lib/social-events";

// Categories shown on the map: society event categories plus the extra ones
// students can pick when hosting a Social event.
export type MapCategory = EventCategory | Exclude<SocialCategory, "sport" | "social" | "nightlife">;

export const MAP_CATEGORIES: { value: MapCategory; label: string }[] = [
  ...CATEGORIES,
  { value: "study", label: "Study" },
  { value: "food", label: "Food" },
  { value: "other", label: "Other" },
];

export function mapCategoryLabel(value: MapCategory) {
  return MAP_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

// A Social event's category, as a map category (the same names, so the same pins).
export function socialToMapCategory(value: SocialCategory): MapCategory {
  return value;
}
