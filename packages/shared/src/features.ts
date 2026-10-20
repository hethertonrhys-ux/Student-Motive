import type { SupabaseClient } from "@supabase/supabase-js";

// Society features: which tools a society uses (sign-up lists, tables, the
// settle-up ledger…). One registry for the whole app, the defaults per
// society type, and hasFeature() to check one. A society's own choices are
// rows in society_features; a feature with no row follows the defaults here.
// The database's society_feature_on() mirrors hasFeature() for every live
// feature, and coming-soon features are always off in both; keep the two in
// step.

type Result = { error?: string };

// ---- Society types ----

export type SocietyType = "social" | "sports" | "cultural" | "academic" | "games" | "arts";

export const SOCIETY_TYPES: { value: SocietyType; label: string; description: string; icon: string; example: string }[] = [
  { value: "social", label: "Social", description: "Socials, nights out, trips and meet-ups.", icon: "people", example: "Freshers' bar crawl" },
  { value: "sports", label: "Sports", description: "Training, matches and team socials.", icon: "football", example: "Weekly 5-a-side and a match-day social" },
  { value: "cultural", label: "Cultural / Nationality", description: "Festivals, food and celebrations for a culture or country.", icon: "globe", example: "Diwali dinner for 150" },
  { value: "academic", label: "Academic / Careers", description: "Talks, panels, workshops and careers events.", icon: "school", example: "Investment banking panel with three speakers" },
  { value: "games", label: "Games / Poker", description: "Poker, chess, board games and esports nights.", icon: "dice", example: "Poker night with three tables" },
  { value: "arts", label: "Arts / Performance", description: "Music, drama, dance and art.", icon: "color-palette", example: "Spring showcase in the Old Theatre" },
];

// ---- The registry ----

export type FeatureGroup = "Sign-ups" | "Money" | "On the night" | "Community" | "Look & feel" | "Specialist" | "Event admin";

export const FEATURE_GROUPS: FeatureGroup[] = ["Sign-ups", "Money", "On the night", "Community", "Look & feel", "Specialist", "Event admin"];

export type FeatureKey =
  // Live
  | "signup_lists"
  | "tables"
  | "ledger"
  | "event_cost"
  | "member_invites"
  | "event_chats"
  | "event_admin"
  // Coming soon
  | "custom_questions"
  | "host_approval"
  | "capacity_waitlist"
  | "members_only_events"
  | "google_form_import"
  | "check_in_qr"
  | "polls"
  | "announcements"
  | "recurring_events"
  | "pinned_event"
  | "society_branding"
  | "committee_page"
  | "photo_gallery"
  | "tournament_brackets"
  | "speaker_qa";

export type FeatureSetting = { key: string; label: string; type: "number" | "text" | "boolean"; default: number | string | boolean };

export type FeatureDef = {
  key: FeatureKey;
  name: string;
  // One line: what it does.
  description: string;
  // Short and concrete.
  example: string;
  group: FeatureGroup;
  // The society types it's pre-ticked for.
  defaultFor: SocietyType[] | "all";
  // Universities (ids like "LSE") where it's pre-ticked for every typed society.
  defaultForUnis?: string[];
  // One of the six features every society had before features could be chosen.
  legacy: boolean;
  status: "live" | "coming_soon";
  settings: FeatureSetting[];
};

export const FEATURES: FeatureDef[] = [
  // Live
  {
    key: "signup_lists",
    name: "Sign-up lists",
    description: "People enter a list with an optional limit; the rest join a waiting list.",
    example: "Chess tournament: 32 places, then a waiting list",
    group: "Sign-ups",
    defaultFor: ["social", "sports", "academic", "games", "arts"],
    legacy: true,
    status: "live",
    settings: [],
  },
  {
    key: "tables",
    name: "Tables and numbered seating",
    description: "Split people across tables, each with its own level and numbered seats.",
    example: "Poker night: 3 tables of 8 with numbered seats",
    group: "On the night",
    defaultFor: ["games"],
    legacy: true,
    status: "live",
    settings: [{ key: "default_seats", label: "Seats per table", type: "number", default: 8 }],
  },
  {
    key: "ledger",
    name: "Settle-up ledger",
    description: "Record buy-ins and results, then see who pays who at the end of the night.",
    example: "Cash game: the bank records buy-ins and cash-outs",
    group: "Money",
    defaultFor: ["games"],
    legacy: true,
    status: "live",
    settings: [],
  },
  {
    key: "event_cost",
    name: "Event cost",
    description: "Show what an event costs, or that it's free. No payments are taken.",
    example: "Bar crawl: £6 per person",
    group: "Money",
    defaultFor: ["social", "sports", "cultural", "games", "arts"],
    legacy: true,
    status: "live",
    settings: [],
  },
  {
    key: "member_invites",
    name: "Member invites",
    description: "Paste your SU membership list; those people are approved as members when they join.",
    example: "Paste 120 emails from your SU membership list",
    group: "Community",
    defaultFor: "all",
    legacy: true,
    status: "live",
    settings: [],
  },
  {
    key: "event_chats",
    name: "Event group chats",
    description: "Everyone going to an event gets a group chat with your committee.",
    example: "Pub quiz: teams find each other in the chat",
    group: "Community",
    defaultFor: "all",
    legacy: true,
    status: "live",
    settings: [],
  },
  {
    key: "event_admin",
    name: "Event admin (SU paperwork)",
    description: "Function prepares the right SU paperwork for each event; your committee checks and submits it.",
    example: "Guest speaker: the right SU form drafted, with the date to submit it by",
    group: "Event admin",
    defaultFor: [],
    defaultForUnis: ["LSE"],
    legacy: false,
    status: "live",
    settings: [],
  },
  // Coming soon
  {
    key: "custom_questions",
    name: "Custom sign-up questions",
    description: "Ask people your own questions when they sign up.",
    example: "Dinner: ask for dietary requirements",
    group: "Sign-ups",
    defaultFor: ["social", "cultural", "academic", "arts"],
    legacy: false,
    status: "coming_soon",
    settings: [],
  },
  {
    key: "host_approval",
    name: "Approve sign-ups",
    description: "Choose who gets a place before it's confirmed.",
    example: "Ski trip: approve each place before it's confirmed",
    group: "Sign-ups",
    defaultFor: ["social", "sports"],
    legacy: false,
    status: "coming_soon",
    settings: [],
  },
  {
    key: "capacity_waitlist",
    name: "Capacity and waiting list",
    description: "Set a limit on any event; everyone after that joins a waiting list.",
    example: "Ball: 200 places, then a waiting list",
    group: "Sign-ups",
    defaultFor: ["social", "cultural", "arts"],
    legacy: false,
    status: "coming_soon",
    settings: [],
  },
  {
    key: "members_only_events",
    name: "Members-only events",
    description: "Events only your members can see, checked against your SU membership list.",
    example: "Members' AGM, hidden from everyone else",
    group: "Sign-ups",
    defaultFor: ["sports", "games"],
    legacy: false,
    status: "coming_soon",
    settings: [],
  },
  {
    key: "google_form_import",
    name: "Google Form link + CSV import of an approved list",
    description: "Keep your Google Form, then import the approved list as a CSV.",
    example: "Ski trip: import the 40 approved names from your form",
    group: "Sign-ups",
    defaultFor: ["social", "sports", "cultural"],
    legacy: false,
    status: "coming_soon",
    settings: [],
  },
  {
    key: "check_in_qr",
    name: "QR check-in",
    description: "Scan people in at the door with a QR code.",
    example: "Winter ball: scan 300 people in at the door",
    group: "On the night",
    defaultFor: ["social", "cultural", "arts"],
    legacy: false,
    status: "coming_soon",
    settings: [],
  },
  {
    key: "polls",
    name: "Polls",
    description: "Ask your members a quick question and see the results live.",
    example: "Which date works for the end-of-term social?",
    group: "Community",
    defaultFor: "all",
    legacy: false,
    status: "coming_soon",
    settings: [],
  },
  {
    key: "announcements",
    name: "Announcements to members",
    description: "Send a message to all your members at once.",
    example: "Tonight's venue has changed to the Three Tuns",
    group: "Community",
    defaultFor: "all",
    legacy: false,
    status: "coming_soon",
    settings: [],
  },
  {
    key: "recurring_events",
    name: "Recurring events: weekly or monthly in one go",
    description: "Post a weekly or monthly event once instead of every time.",
    example: "Chess club every Tuesday at 6pm",
    group: "Event admin",
    defaultFor: ["sports", "games", "academic"],
    legacy: false,
    status: "coming_soon",
    settings: [],
  },
  {
    key: "pinned_event",
    name: "Pinned event",
    description: "Pin your main event to the top of your society page.",
    example: "Pin the winter ball all term",
    group: "Look & feel",
    defaultFor: [],
    legacy: false,
    status: "coming_soon",
    settings: [],
  },
  {
    key: "society_branding",
    name: "Society colours and banner",
    description: "Your society's colours and a banner image on your page.",
    example: "Your crest and colours across your society page",
    group: "Look & feel",
    defaultFor: [],
    legacy: false,
    status: "coming_soon",
    settings: [],
  },
  {
    key: "committee_page",
    name: "Committee page",
    description: "Show who's on your committee and what each person does.",
    example: "President, treasurer and social secretary with photos",
    group: "Look & feel",
    defaultFor: [],
    legacy: false,
    status: "coming_soon",
    settings: [],
  },
  {
    key: "photo_gallery",
    name: "Photo gallery",
    description: "Share photos from your events with your members.",
    example: "Photos from last night's social",
    group: "Community",
    defaultFor: ["social", "cultural", "arts"],
    legacy: false,
    status: "coming_soon",
    settings: [],
  },
  {
    key: "tournament_brackets",
    name: "Tournament brackets",
    description: "Run knockout brackets and leagues, round by round.",
    example: "Chess knockout: 16 players, 4 rounds",
    group: "Specialist",
    defaultFor: ["games", "sports"],
    legacy: false,
    status: "coming_soon",
    settings: [],
  },
  {
    key: "speaker_qa",
    name: "Speaker Q&A",
    description: "Collect questions for a speaker and let the audience vote them up.",
    example: "Panel talk: the most-voted questions go first",
    group: "Specialist",
    defaultFor: ["academic"],
    legacy: false,
    status: "coming_soon",
    settings: [],
  },
];

const BY_KEY = new Map<string, FeatureDef>(FEATURES.map((f) => [f.key, f]));

export function featureDef(key: FeatureKey): FeatureDef | undefined {
  return BY_KEY.get(key);
}

// ---- Checking a feature ----

export type FeatureRow = { feature_key: string; enabled: boolean; config?: Record<string, unknown> | null };

// What hasFeature needs to know about a society.
export type FeatureSubject = { society_type: SocietyType | null; university: string; features?: FeatureRow[] | null };

// A society as it comes back from a nested select (society_type and
// society_features(...)), as a FeatureSubject; null for no society.
export function featureSubject(society: { society_type?: SocietyType | null; university: string; society_features?: FeatureRow[] | null } | null | undefined): FeatureSubject | null {
  if (!society) return null;
  return { society_type: society.society_type ?? null, university: society.university, features: society.society_features ?? null };
}

const typeDefault = (def: FeatureDef, type: SocietyType, university: string) => def.defaultFor === "all" || def.defaultFor.includes(type) || (def.defaultForUnis ?? []).includes(university);

// Is this feature on for this society? No society (a student's own event):
// only event chats and event cost. Coming-soon features are always off. A
// society's own choice wins; otherwise a society that hasn't picked a type
// (every society from before) keeps the six existing features, and a typed
// society gets the defaults for its type (and its uni).
export function hasFeature(society: FeatureSubject | null | undefined, key: FeatureKey): boolean {
  const def = BY_KEY.get(key);
  if (!def || def.status !== "live") return false;
  if (!society) return key === "event_chats" || key === "event_cost";
  const row = society.features?.find((f) => f.feature_key === key);
  if (row) return row.enabled;
  if (!society.society_type) return def.legacy;
  return typeDefault(def, society.society_type, society.university);
}

// A feature's settings: the society's own over the defaults.
export function featureConfig(society: FeatureSubject | null | undefined, key: FeatureKey): Record<string, unknown> {
  const defaults = Object.fromEntries((BY_KEY.get(key)?.settings ?? []).map((s) => [s.key, s.default]));
  const row = society?.features?.find((f) => f.feature_key === key);
  return { ...defaults, ...(row?.config ?? {}) };
}

// The live features pre-ticked for a society of this type at this uni.
export function defaultFeatureKeys(type: SocietyType, university: string): FeatureKey[] {
  return FEATURES.filter((f) => f.status === "live" && typeDefault(f, type, university)).map((f) => f.key);
}

// ---- Loading and saving ----

// A society's type, uni and feature rows. If they can't be read (or the
// society isn't found), it counts as a society from before features, which
// keeps everything as it was.
export async function loadSocietyFeatures(supabase: SupabaseClient, societyId: string): Promise<FeatureSubject> {
  const { data, error } = await supabase.from("societies").select("society_type, university, society_features(feature_key, enabled, config)").eq("id", societyId).maybeSingle();
  if (error || !data) return { society_type: null, university: "", features: null };
  return featureSubject(data as { society_type: SocietyType | null; university: string; society_features: FeatureRow[] | null })!;
}

// Switch one feature on or off (and, optionally, save its settings).
export async function setSocietyFeature(supabase: SupabaseClient, societyId: string, key: FeatureKey, enabled: boolean, config?: Record<string, unknown>): Promise<Result> {
  const { error } = await supabase.from("society_features").upsert({ society_id: societyId, feature_key: key, enabled, ...(config ? { config } : {}) }, { onConflict: "society_id,feature_key" });
  return error ? { error: "Couldn't save. Please try again." } : {};
}

// Switch several features on or off at once, e.g. { tables: true, ledger: false }.
export async function setSocietyFeatures(supabase: SupabaseClient, societyId: string, keys: Partial<Record<FeatureKey, boolean>>): Promise<Result> {
  const rows = Object.entries(keys)
    .filter((entry): entry is [FeatureKey, boolean] => typeof entry[1] === "boolean")
    .map(([feature_key, enabled]) => ({ society_id: societyId, feature_key, enabled }));
  if (rows.length === 0) return {};
  const { error } = await supabase.from("society_features").upsert(rows, { onConflict: "society_id,feature_key" });
  return error ? { error: "Couldn't save. Please try again." } : {};
}
