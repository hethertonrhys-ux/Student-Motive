// Shared definitions for the Social section (students hosting their own
// events). Separate from Societies: different tables and different rules.

export type SocialCategory = "sport" | "social" | "study" | "nightlife" | "other";
export type MemberStatus = "going" | "pending" | "declined";

export const SOCIAL_CATEGORIES: { value: SocialCategory; label: string }[] = [
  { value: "sport", label: "Sport" },
  { value: "social", label: "Social" },
  { value: "study", label: "Study" },
  { value: "nightlife", label: "Nightlife" },
  { value: "other", label: "Other" },
];

export const categoryInfo = (value: SocialCategory) => SOCIAL_CATEGORIES.find((c) => c.value === value) ?? SOCIAL_CATEGORIES[4];

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
