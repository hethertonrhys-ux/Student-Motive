// Shared definitions for the Social section (students hosting their own
// events). Separate from Societies: different tables and different rules.

import { londonInputToIso } from "./time";

export type SocialCategory = "sport" | "social" | "study" | "nightlife" | "food" | "other";
export type MemberStatus = "going" | "pending" | "declined";

export const SOCIAL_CATEGORIES: { value: SocialCategory; label: string }[] = [
  { value: "sport", label: "Sport" },
  { value: "social", label: "Social" },
  { value: "study", label: "Study" },
  { value: "nightlife", label: "Nightlife" },
  { value: "food", label: "Food" },
  { value: "other", label: "Other" },
];

export const categoryInfo = (value: SocialCategory) => SOCIAL_CATEGORIES.find((c) => c.value === value) ?? SOCIAL_CATEGORIES[SOCIAL_CATEGORIES.length - 1];

export type SocialEvent = {
  id: string;
  host_id: string;
  title: string;
  category: SocialCategory;
  description: string | null;
  starts_at: string;
  ends_at: string;
  area: string;
  lat: number;
  lng: number;
  spaces: number;
  is_private: boolean;
  friends_only: boolean;
  is_cancelled: boolean;
  going_count: number;
};

export const SOCIAL_EVENT_FIELDS =
  "id, host_id, title, category, description, starts_at, ends_at, area, lat, lng, spaces, is_private, friends_only, is_cancelled, going_count";

// The host takes one space.
export function spacesLeft(e: Pick<SocialEvent, "spaces" | "going_count">) {
  return Math.max(0, e.spaces - 1 - e.going_count);
}

export function spacesLabel(e: Pick<SocialEvent, "spaces" | "going_count">) {
  const left = spacesLeft(e);
  return left === 0 ? "Full" : `${left} of ${e.spaces} spaces left`;
}

const LONDON = "Europe/London";
export const formatWhen = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: LONDON }).format(new Date(iso));

// What the event's button should say for the person looking at it.
export type JoinState = "host" | "going" | "pending" | "declined" | "full" | "join" | "request" | "finished" | "cancelled" | "login";

// Discover filters, checked on the phone so results change the moment you tap.
// Several categories can be ticked: an event shows if it's in any of them.
export type DiscoverFilters = { categories: string[]; date: string; type: string; available: boolean; q: string };

// The ticked categories from the web address (?category=social,nightlife).
export function readCategories(value: string | null): SocialCategory[] {
  const valid = new Set<string>(SOCIAL_CATEGORIES.map((c) => c.value));
  return (value ?? "").split(",").filter((c): c is SocialCategory => valid.has(c));
}

// Midnight (UK time) at the start of a YYYY-MM-DD day, plus some days.
function londonDayStart(day: string, addDays = 0) {
  const iso = londonInputToIso(`${day}T00:00`);
  return iso ? new Date(iso).getTime() + addDays * 86400e3 : null;
}
const londonToday = (now: number) => new Intl.DateTimeFormat("en-CA", { timeZone: LONDON }).format(new Date(now));

export function matchesDiscover(e: SocialEvent, f: DiscoverFilters, now: number) {
  if (f.categories.length && !f.categories.includes(e.category)) return false;
  if (f.type === "open" && e.is_private) return false;
  if (f.type === "private" && !e.is_private) return false;
  if (f.available && spacesLeft(e) === 0) return false;
  const q = f.q.trim().toLowerCase();
  if (q && !e.title.toLowerCase().includes(q) && !e.area.toLowerCase().includes(q)) return false;
  const today = londonToday(now);
  const range =
    f.date === "today"
      ? [londonDayStart(today), londonDayStart(today, 1)]
      : f.date === "week"
        ? [now, londonDayStart(today, 7)]
        : /^\d{4}-\d{2}-\d{2}$/.test(f.date)
          ? [londonDayStart(f.date), londonDayStart(f.date, 1)]
          : null;
  if (range?.[0] != null && range[1] != null) {
    if (!(new Date(e.starts_at).getTime() < range[1] && new Date(e.ends_at).getTime() > range[0])) return false;
  }
  return true;
}
