// The universities Function is open to. This is the one place to add a uni.
//
// - id: what's stored in the database (societies.university and
//   profiles.university). Never change an existing id.
// - slug: its landing page, e.g. studentfunction.com/kings.
// - domains: the email domains that prove someone studies there. Exact
//   domains only (no subdomains like alumni.lse.ac.uk). Keep these the same
//   as the universities table in the database (see the London migration).
// - accent: an optional colour used for small touches on its pages. Plain
//   app colours, not the uni's official colours: no logos, crests or
//   official branding anywhere.
// - centre: where the map opens for its students ([longitude, latitude]).

export type UniId = "LSE" | "UCL" | "KCL" | "Imperial";

export type University = {
  id: UniId;
  name: string;
  short: string;
  slug: string;
  domains: string[];
  accent: string;
  centre: [number, number];
};

export const UNIVERSITIES: University[] = [
  { id: "LSE", name: "London School of Economics", short: "LSE", slug: "lse", domains: ["lse.ac.uk"], accent: "#DA291C", centre: [-0.1168, 51.5146] },
  { id: "UCL", name: "University College London", short: "UCL", slug: "ucl", domains: ["ucl.ac.uk"], accent: "#0f766e", centre: [-0.134, 51.5246] },
  { id: "KCL", name: "King's College London", short: "King's", slug: "kings", domains: ["kcl.ac.uk"], accent: "#be123c", centre: [-0.116, 51.5115] },
  // Older Imperial accounts still use @ic.ac.uk.
  { id: "Imperial", name: "Imperial College London", short: "Imperial", slug: "imperial", domains: ["imperial.ac.uk", "ic.ac.uk"], accent: "#1d4ed8", centre: [-0.1749, 51.4988] },
];

// Existing accounts and societies without a uni count as LSE, where Function started.
export const DEFAULT_UNI: UniId = "LSE";

// Onboarding only shows how many societies or events a uni has once there
// are at least this many, so a new uni never looks empty.
export const SHOW_SOCIETY_COUNT_FROM = 10;
export const SHOW_EVENT_COUNT_FROM = 5;

// The cookie that remembers which uni's landing page someone arrived on.
export const ARRIVAL_UNI_COOKIE = "fn-uni";

export function uniById(id: string | null | undefined): University | null {
  return UNIVERSITIES.find((u) => u.id === id) ?? null;
}

export function uniBySlug(slug: string | null | undefined): University | null {
  return UNIVERSITIES.find((u) => u.slug === slug) ?? null;
}

// Which uni an email belongs to, from its domain (exact match only).
export function uniFromEmail(email: string | null | undefined): University | null {
  const domain = (email ?? "").trim().toLowerCase().split("@")[1] ?? "";
  return UNIVERSITIES.find((u) => u.domains.includes(domain)) ?? null;
}

// Short name, falling back to LSE for anything unknown.
export const uniShort = (id: string | null | undefined) => (uniById(id) ?? uniById(DEFAULT_UNI)!).short;

// "UCL, King's and Imperial": every uni except this one.
export function otherUnisText(id: string | null | undefined) {
  const names = UNIVERSITIES.filter((u) => u.id !== id).map((u) => u.short);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
}

// "LSE, UCL, King's and Imperial"
export const ALL_UNIS_TEXT = `${UNIVERSITIES.slice(0, -1).map((u) => u.short).join(", ")} and ${UNIVERSITIES.at(-1)!.short}`;

// Society names often start with the uni ("LSE Poker Society"); drop that
// when taking the first letter for a placeholder logo.
export function initialOf(name: string) {
  const prefixes = UNIVERSITIES.flatMap((u) => [u.short, u.id, u.slug]).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return name.replace(new RegExp(`^(${prefixes.join("|")})\\s+`, "i"), "").charAt(0);
}

// Who can see a society's event.
export type Audience = "members" | "uni" | "london";
export const AUDIENCES: Audience[] = ["members", "uni", "london"];
export function audienceLabel(audience: Audience, uniId: string | null | undefined) {
  if (audience === "members") return "Members only";
  if (audience === "london") return "Open to all London students";
  return `${uniShort(uniId)} students`;
}
