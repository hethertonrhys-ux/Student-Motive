// Shapes of the database rows the website uses.
// Matches supabase/migrations/20261015000000_initial_schema.sql.

import type { SocietyType } from "./features";
import type { Audience, UniId } from "./universities";

export type OrgKind = "society" | "hall" | "university" | "promoter";
export type EventCategory = "social" | "nightlife" | "careers" | "sport" | "arts" | "talks";
export type VenueKind = "campus" | "hall" | "university" | "club" | "other";

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  is_admin: boolean;
  // One of the ids in universities.ts ("LSE", "UCL", "QMUL", ...).
  university: UniId;
  // The account details asked for on sign-up. display_name is what other
  // students see: the nickname when there is one, otherwise the full name.
  full_name: string | null;
  nickname: string | null;
  graduation_year: number | null;
  // Two-letter country code, optional (shown as a flag).
  country?: string | null;
};

// The columns the app reads for the logged-in person's own profile.
export const PROFILE_COLUMNS = "id, email, display_name, is_admin, university, full_name, nickname, graduation_year, country";

// Accounts made before these fields existed (or who skipped them) are asked
// to fill them in the next time they open the app.
export function accountDetailsMissing(profile: Pick<Profile, "full_name" | "graduation_year"> | null | undefined) {
  if (!profile) return false;
  return !profile.full_name?.trim() || !profile.graduation_year;
}

export type Society = {
  id: string;
  slug: string;
  name: string;
  kind: OrgKind;
  university: string;
  description: string | null;
  logo_url: string | null;
  instagram: string | null;
  website: string | null;
  is_verified: boolean;
  // Imported from a students' union directory: "su_directory" and the SU page.
  source?: string | null;
  source_url?: string | null;
  // Picked in the Society Hub; null for societies from before (see features.ts).
  society_type?: SocietyType | null;
  // Marked by the Function team (the Hub then shows the Founding Society agreement).
  is_founding?: boolean;
  // When the committee finished the Hub's setup; null until then.
  onboarded_at?: string | null;
};

export type Venue = {
  id: string;
  name: string;
  short_name: string | null;
  kind: VenueKind;
  address: string | null;
  lat: number;
  lng: number;
};

export type MotiveEvent = {
  id: string;
  // A society's event, or one a student is hosting (exactly one is set).
  society_id: string | null;
  host_user_id: string | null;
  visibility: "public" | "friends";
  join_mode: "open" | "approval";
  title: string;
  description: string | null;
  category: EventCategory;
  free_food: boolean;
  // Display only, in pence: null = not given, 0 = Free.
  cost_pence?: number | null;
  venue_id: string | null;
  // A custom pin, used when the event isn't at one of the listed venues.
  lat: number | null;
  lng: number | null;
  location_note: string | null;
  starts_at: string;
  ends_at: string;
  image_url: string | null;
  ticket_url: string | null;
  is_cancelled: boolean;
  is_hidden: boolean;
  going_count: number;
  format: EventFormat;
  capacity: number | null;
  members_only: boolean;
  // Who can see it (society events only).
  audience: Audience;
  results_published: boolean;
};

export type EventFormat = "standard" | "entries" | "tables";

export const FORMATS: { value: EventFormat; label: string; help: string }[] = [
  { value: "standard", label: "Standard", help: "People tap \"I'm going\"." },
  { value: "entries", label: "Sign-up list", help: "People enter; set a limit and the rest join a waiting list. Good for tournaments." },
  { value: "tables", label: "Tables", help: "People pick a table, each with its own level and seats. Good for cash games." },
];

export type EventTable = {
  id: string;
  event_id: string;
  name: string;
  level: string | null;
  seats: number;
  position: number;
  bank_user_id: string | null;
  started_at: string | null;
};

export type EntryStatus = "going" | "waitlist";

// Suggested table levels (societies can also type their own).
export const POKER_STAKES = ["Free", "2p/5p", "5p/10p", "10p/20p", "25p/50p", "50p/£1", "£1/£2"];
export const DEFAULT_SEATS = 8;

export const CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: "social", label: "Social" },
  { value: "nightlife", label: "Nightlife" },
  { value: "careers", label: "Careers" },
  { value: "sport", label: "Sport" },
  { value: "arts", label: "Arts & culture" },
  { value: "talks", label: "Talks" },
];

export function categoryLabel(value: EventCategory) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
