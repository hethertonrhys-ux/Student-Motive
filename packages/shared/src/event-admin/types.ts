// The committee's answers about an event, which decide the SU paperwork.
// Stored in public.event_admin (supabase/migrations/20261121000000_event_admin.sql).

// Where the event is: on campus, somewhere else in London, or 'away'
// (outside London / the M25, or overnight).
export type VenueType = "campus" | "london" | "away";
export type AlcoholLevel = "none" | "available" | "focus";

export type CostLine = { label: string; pence: number };

export type EventAdminAnswers = {
  expectedAttendees: number | null;
  venueType: VenueType;
  alcohol: AlcoholLevel;
  externalSpeaker: boolean;
  speakerNames: string;
  speakerOrg: string;
  nonLseGuests: boolean;
  openToPublic: boolean;
  // The total budget in pence, as the committee typed it.
  budgetPence: number | null;
  // What the money goes on (e.g. "Room hire", "Pizza").
  costLines: CostLine[];
  physicalActivity: boolean;
  food: boolean;
  // The event's Native ticket page (LSESU's only approved ticketing).
  nativeUrl: string;
};

export type EventAdminForm = "regular" | "large" | "trip";

export type ChecklistKey = "form_submitted" | "su_approved" | "room_confirmed" | "academic_chair" | "native_tickets" | "security_list";

export type ChecklistItem = {
  key: ChecklistKey;
  label: string;
  // Whether this event needs it (items that don't apply are still listed, marked not needed).
  needed: boolean;
  // The date ('YYYY-MM-DD') to have it done by.
  deadline: string;
};

export type HazardRating = "low" | "medium" | "high";

export type HazardKey = "crowding" | "alcohol" | "travel" | "late_finish" | "physical_activity" | "food" | "external_speaker" | "weather";

export type Hazard = {
  key: HazardKey;
  title: string;
  whoAtRisk: string;
  controls: string[];
  rating: HazardRating;
  // Why it's on the list, from the answers.
  reason: string;
};
