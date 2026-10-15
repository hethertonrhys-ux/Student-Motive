// Shapes of the database rows the website uses.
// Matches supabase/migrations/20261015000000_initial_schema.sql.

export type OrgKind = "society" | "hall" | "university" | "promoter";
export type EventCategory = "social" | "nightlife" | "careers" | "sport" | "arts" | "talks";
export type VenueKind = "campus" | "hall" | "university" | "club" | "other";

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  is_admin: boolean;
};

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
  society_id: string;
  title: string;
  description: string | null;
  category: EventCategory;
  free_food: boolean;
  venue_id: string | null;
  location_note: string | null;
  starts_at: string;
  ends_at: string;
  image_url: string | null;
  ticket_url: string | null;
  is_cancelled: boolean;
  is_hidden: boolean;
  going_count: number;
};

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
