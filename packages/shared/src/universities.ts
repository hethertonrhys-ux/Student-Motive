// The London universities Function is open to. THIS IS THE ONE PLACE TO EDIT
// to add a university or a student email domain.
//
// - id: what's stored in the database (societies.university and
//   profiles.university). Never change an existing id.
// - short: the name shown on tags and pages ("LSE", "King's").
// - slug: its landing page, e.g. studentfunction.com/kings (only the first
//   four have a page of their own today).
// - domains: the email domains that prove someone studies there. A domain
//   also covers its subdomains, so "rhul.ac.uk" accepts "live.rhul.ac.uk".
// - accent: a colour for small touches on its pages. Plain app colours, not
//   the uni's official colours: no logos, crests or official branding.
// - centre: where the map opens for its students ([longitude, latitude]).
//
// The database keeps the same list in its `universities` table, which is
// what actually decides who may sign up. After editing this file, run the
// matching SQL (see supabase/migrations/20261108000000_accounts_and_london_unis.sql
// for the pattern: an insert into universities with the new id, name,
// short name and domains).

export const UNI_IDS = ["LSE", "UCL", "KCL", "Imperial", "QMUL", "City", "Goldsmiths", "RHUL", "Birkbeck", "SOAS", "Brunel", "Westminster", "Greenwich", "Kingston", "LondonMet", "Middlesex", "Roehampton", "UAL", "UEL", "LSBU", "StMarys", "UWL", "RVC", "LSHTM", "ICR", "LBS", "Regents", "Courtauld", "RCA", "RAM", "RCM", "Guildhall", "TrinityLaban", "CSSD", "Ravensbourne", "UoL", "Richmond", "NUL", "Hult"] as const;
export type UniId = (typeof UNI_IDS)[number];

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
  { id: "Imperial", name: "Imperial College London", short: "Imperial", slug: "imperial", domains: ["imperial.ac.uk", "ic.ac.uk"], accent: "#1d4ed8", centre: [-0.1749, 51.4988] },
  { id: "QMUL", name: "Queen Mary University of London", short: "QMUL", slug: "qmul", domains: ["qmul.ac.uk"], accent: "#7c3aed", centre: [-0.0407, 51.5246] },
  { id: "City", name: "City St George's, University of London", short: "City St George's", slug: "city", domains: ["city.ac.uk", "citystgeorges.ac.uk", "sgul.ac.uk"], accent: "#c2410c", centre: [-0.1025, 51.5277] },
  { id: "Goldsmiths", name: "Goldsmiths, University of London", short: "Goldsmiths", slug: "goldsmiths", domains: ["gold.ac.uk"], accent: "#0369a1", centre: [-0.0356, 51.4746] },
  { id: "RHUL", name: "Royal Holloway, University of London", short: "Royal Holloway", slug: "royal-holloway", domains: ["rhul.ac.uk", "live.rhul.ac.uk"], accent: "#b45309", centre: [-0.5668, 51.4256] },
  { id: "Birkbeck", name: "Birkbeck, University of London", short: "Birkbeck", slug: "birkbeck", domains: ["bbk.ac.uk"], accent: "#4d7c0f", centre: [-0.13, 51.5218] },
  { id: "SOAS", name: "SOAS University of London", short: "SOAS", slug: "soas", domains: ["soas.ac.uk"], accent: "#9d174d", centre: [-0.1289, 51.5223] },
  { id: "Brunel", name: "Brunel University of London", short: "Brunel", slug: "brunel", domains: ["brunel.ac.uk"], accent: "#0e7490", centre: [-0.4731, 51.533] },
  { id: "Westminster", name: "University of Westminster", short: "Westminster", slug: "westminster", domains: ["westminster.ac.uk", "my.westminster.ac.uk"], accent: "#6d28d9", centre: [-0.1409, 51.5169] },
  { id: "Greenwich", name: "University of Greenwich", short: "Greenwich", slug: "greenwich", domains: ["gre.ac.uk", "greenwich.ac.uk"], accent: "#15803d", centre: [0.0068, 51.4826] },
  { id: "Kingston", name: "Kingston University London", short: "Kingston", slug: "kingston", domains: ["kingston.ac.uk"], accent: "#a21caf", centre: [-0.3043, 51.4034] },
  { id: "LondonMet", name: "London Metropolitan University", short: "London Met", slug: "london-met", domains: ["londonmet.ac.uk"], accent: "#1d4ed8", centre: [-0.1137, 51.5527] },
  { id: "Middlesex", name: "Middlesex University", short: "Middlesex", slug: "middlesex", domains: ["mdx.ac.uk", "live.mdx.ac.uk"], accent: "#b91c1c", centre: [-0.2283, 51.5898] },
  { id: "Roehampton", name: "University of Roehampton", short: "Roehampton", slug: "roehampton", domains: ["roehampton.ac.uk"], accent: "#047857", centre: [-0.2457, 51.4572] },
  { id: "UAL", name: "University of the Arts London", short: "UAL", slug: "ual", domains: ["arts.ac.uk"], accent: "#0f172a", centre: [-0.1252, 51.5351] },
  { id: "UEL", name: "University of East London", short: "UEL", slug: "uel", domains: ["uel.ac.uk"], accent: "#0284c7", centre: [0.0626, 51.5075] },
  { id: "LSBU", name: "London South Bank University", short: "LSBU", slug: "lsbu", domains: ["lsbu.ac.uk"], accent: "#c026d3", centre: [-0.1013, 51.4982] },
  { id: "StMarys", name: "St Mary's University, Twickenham", short: "St Mary's", slug: "st-marys", domains: ["stmarys.ac.uk", "live.stmarys.ac.uk"], accent: "#1e40af", centre: [-0.3277, 51.4337] },
  { id: "UWL", name: "University of West London", short: "UWL", slug: "uwl", domains: ["uwl.ac.uk"], accent: "#b45309", centre: [-0.3055, 51.5069] },
  { id: "RVC", name: "Royal Veterinary College", short: "RVC", slug: "rvc", domains: ["rvc.ac.uk"], accent: "#065f46", centre: [-0.1361, 51.5366] },
  { id: "LSHTM", name: "London School of Hygiene & Tropical Medicine", short: "LSHTM", slug: "lshtm", domains: ["lshtm.ac.uk"], accent: "#0369a1", centre: [-0.1304, 51.5207] },
  { id: "ICR", name: "Institute of Cancer Research", short: "ICR", slug: "icr", domains: ["icr.ac.uk"], accent: "#7c2d12", centre: [-0.1733, 51.4878] },
  { id: "LBS", name: "London Business School", short: "LBS", slug: "lbs", domains: ["london.edu"], accent: "#1e3a8a", centre: [-0.1596, 51.5265] },
  { id: "Regents", name: "Regent's University London", short: "Regent's", slug: "regents", domains: ["regents.ac.uk"], accent: "#9f1239", centre: [-0.1548, 51.5262] },
  { id: "Courtauld", name: "The Courtauld Institute of Art", short: "Courtauld", slug: "courtauld", domains: ["courtauld.ac.uk"], accent: "#78350f", centre: [-0.1177, 51.511] },
  { id: "RCA", name: "Royal College of Art", short: "RCA", slug: "rca", domains: ["rca.ac.uk"], accent: "#0f172a", centre: [-0.1783, 51.5009] },
  { id: "RAM", name: "Royal Academy of Music", short: "RAM", slug: "ram", domains: ["ram.ac.uk"], accent: "#6b21a8", centre: [-0.1526, 51.5231] },
  { id: "RCM", name: "Royal College of Music", short: "RCM", slug: "rcm", domains: ["rcm.ac.uk"], accent: "#be185d", centre: [-0.1766, 51.4997] },
  { id: "Guildhall", name: "Guildhall School of Music & Drama", short: "Guildhall", slug: "guildhall", domains: ["gsmd.ac.uk"], accent: "#0e7490", centre: [-0.0925, 51.5199] },
  { id: "TrinityLaban", name: "Trinity Laban Conservatoire of Music and Dance", short: "Trinity Laban", slug: "trinity-laban", domains: ["trinitylaban.ac.uk"], accent: "#4338ca", centre: [-0.0063, 51.4834] },
  { id: "CSSD", name: "Royal Central School of Speech and Drama", short: "Central", slug: "central", domains: ["cssd.ac.uk"], accent: "#be123c", centre: [-0.1739, 51.5431] },
  { id: "Ravensbourne", name: "Ravensbourne University London", short: "Ravensbourne", slug: "ravensbourne", domains: ["ravensbourne.ac.uk", "rave.ac.uk"], accent: "#0d9488", centre: [0.0053, 51.5004] },
  { id: "UoL", name: "University of London (Senate House and intercollegiate halls)", short: "UoL", slug: "university-of-london", domains: ["london.ac.uk"], accent: "#1f2937", centre: [-0.1291, 51.5214] },
  { id: "Richmond", name: "Richmond American University London", short: "Richmond", slug: "richmond", domains: ["richmond.ac.uk"], accent: "#1d4ed8", centre: [-0.2944, 51.4617] },
  { id: "NUL", name: "Northeastern University London", short: "Northeastern", slug: "northeastern", domains: ["nulondon.ac.uk", "nchlondon.ac.uk"], accent: "#b91c1c", centre: [-0.0781, 51.5095] },
  { id: "Hult", name: "Hult International Business School (London)", short: "Hult", slug: "hult", domains: ["hult.edu"], accent: "#0f766e", centre: [-0.0753, 51.5118] },
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

// Which uni an email belongs to, from its domain. A listed domain also
// covers its subdomains ("live.rhul.ac.uk" counts as "rhul.ac.uk").
export function uniFromEmail(email: string | null | undefined): University | null {
  const domain = (email ?? "").trim().toLowerCase().split("@")[1] ?? "";
  if (!domain) return null;
  return UNIVERSITIES.find((u) => u.domains.includes(domain)) ?? UNIVERSITIES.find((u) => u.domains.some((d) => domain.endsWith("." + d))) ?? null;
}

// Is this a London university email at all?
export const isLondonUniEmail = (email: string | null | undefined) => uniFromEmail(email) !== null;

// Short name, falling back to LSE for anything unknown.
export const uniShort = (id: string | null | undefined) => (uniById(id) ?? uniById(DEFAULT_UNI)!).short;

// "London's other universities" (there are too many to list by name).
export function otherUnisText(_id: string | null | undefined) {
  return "London's other universities";
}

// How the app describes who it's for.
export const ALL_UNIS_TEXT = "every London university";

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
