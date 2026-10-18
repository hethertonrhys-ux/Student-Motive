// LSE buildings, theatres, halls and spots, so they come up first when
// searching for a place (the public address search doesn't know most of
// them by name). Positions are [lng, lat]; campus ones are taken from the
// campus map (public/lse-campus.geojson), halls from the venue list.

export type LsePlace = { name: string; detail: string; at: [number, number]; also?: string[] };

export const LSE_PLACES: LsePlace[] = [
  // Campus buildings
  { name: "Marshall Building", detail: "LSE · 44 Lincoln's Inn Fields", at: [-0.11676, 51.51512], also: ["MAR"] },
  { name: "Centre Building", detail: "LSE · Houghton Street", at: [-0.11626, 51.51414], also: ["CBG"] },
  { name: "Old Building", detail: "LSE · Houghton Street", at: [-0.11682, 51.51372], also: ["OLD"] },
  { name: "Saw Swee Hock Student Centre", detail: "LSE · Students' Union, 1 Sheffield Street", at: [-0.11756, 51.51478], also: ["SAW", "Students Union", "SU"] },
  { name: "LSE Library", detail: "LSE · Lionel Robbins Building, 10 Portugal Street", at: [-0.11572, 51.51467], also: ["LIB", "Lionel Robbins", "BLPES"] },
  { name: "Sir Arthur Lewis Building", detail: "LSE · 32 Lincoln's Inn Fields", at: [-0.11488, 51.51559], also: ["SAL", "32L", "32 Lincoln's Inn Fields"] },
  { name: "Cheng Kin Ku Building", detail: "LSE · 54 Lincoln's Inn Fields (was the New Academic Building)", at: [-0.11801, 51.51538], also: ["CKK", "NAB", "New Academic Building"] },
  { name: "Pankhurst House", detail: "LSE · 1 Clement's Inn", at: [-0.11559, 51.51385], also: ["PAN"] },
  { name: "Connaught House", detail: "LSE · 63-65 Aldwych", at: [-0.11698, 51.51343], also: ["CON"] },
  { name: "Clement House", detail: "LSE · 99 Aldwych", at: [-0.11513, 51.5133], also: ["CLM"] },
  { name: "Lincoln Chambers", detail: "LSE · 2-10 Portugal Street", at: [-0.11721, 51.51491], also: ["LCH"] },
  { name: "King's Chambers", detail: "LSE · Portugal Street", at: [-0.11696, 51.51461], also: ["KGS", "Kings Chambers"] },
  { name: "Lakatos Building", detail: "LSE · Portugal Street", at: [-0.1166, 51.51469], also: ["LAK"] },
  { name: "20 Kingsway", detail: "LSE · 20 Kingsway", at: [-0.1177, 51.5142], also: ["KSW"] },
  { name: "Parish Hall", detail: "LSE · Sheffield Street", at: [-0.11723, 51.5145], also: ["PAR"] },
  { name: "Fawcett House", detail: "LSE · Clare Market", at: [-0.11738, 51.51433], also: ["FAW", "Clare Market"] },
  { name: "Tower One", detail: "LSE · Clement's Inn", at: [-0.11585, 51.51362], also: ["TW1", "Tower 1"] },
  { name: "Tower Two", detail: "LSE · Clement's Inn", at: [-0.11575, 51.51352], also: ["TW2", "Tower 2"] },
  { name: "Tower Three", detail: "LSE · Clement's Inn", at: [-0.11565, 51.51342], also: ["TW3", "Tower 3"] },
  { name: "Columbia House", detail: "LSE · 69 Aldwych", at: [-0.11725, 51.51335], also: ["COL"] },
  { name: "Cowdray House", detail: "LSE · Portugal Street", at: [-0.11625, 51.51478], also: ["COW"] },
  // Theatres, rooms and spots
  { name: "Peacock Theatre", detail: "LSE · Portugal Street", at: [-0.11763, 51.51442], also: ["PEA"] },
  { name: "Sheikh Zayed Theatre", detail: "LSE · Cheng Kin Ku Building", at: [-0.11801, 51.51538], also: ["SZT"] },
  { name: "Thai Theatre", detail: "LSE · Cheng Kin Ku Building", at: [-0.11801, 51.51538] },
  { name: "Wolfson Theatre", detail: "LSE · Cheng Kin Ku Building", at: [-0.11801, 51.51538] },
  { name: "Old Theatre", detail: "LSE · Old Building", at: [-0.11682, 51.51372] },
  { name: "Shaw Library", detail: "LSE · Old Building", at: [-0.11682, 51.51372] },
  { name: "Hong Kong Theatre", detail: "LSE · Clement House", at: [-0.11513, 51.5133] },
  { name: "Marshall Building Lecture Theatre", detail: "LSE · Marshall Building", at: [-0.11676, 51.51512] },
  { name: "The Three Tuns", detail: "LSE · Students' Union bar, Saw Swee Hock", at: [-0.11756, 51.51478], also: ["Tuns", "SU bar"] },
  { name: "The George IV", detail: "LSE · pub on Portugal Street", at: [-0.11684, 51.51471], also: ["George 4"] },
  { name: "LSE Square", detail: "LSE · outside Centre Building", at: [-0.11613, 51.51431] },
  { name: "Houghton Street", detail: "LSE · the main campus street", at: [-0.11664, 51.51368] },
  { name: "Lincoln's Inn Fields", detail: "Park next to LSE", at: [-0.11657, 51.51623] },
  // Halls of residence
  { name: "Bankside House", detail: "LSE hall · 24 Sumner Street, SE1", at: [-0.0983, 51.5077] },
  { name: "Butler's Wharf Residence", detail: "LSE hall · 11 Gainsford Street, SE1", at: [-0.072, 51.5025], also: ["Butlers Wharf"] },
  { name: "Carr-Saunders Hall", detail: "LSE hall · 18-24 Fitzroy Street, W1", at: [-0.1381, 51.5214], also: ["Carr Saunders"] },
  { name: "Grosvenor House", detail: "LSE hall · 141-143 Drury Lane, WC2", at: [-0.1218, 51.5143] },
  { name: "High Holborn Residence", detail: "LSE hall · 178 High Holborn, WC1", at: [-0.1253, 51.5168] },
  { name: "Lilian Knowles House", detail: "LSE hall · 50 Crispin Street, E1", at: [-0.0757, 51.5193] },
  { name: "Northumberland House", detail: "LSE hall · 8a Northumberland Avenue, WC2", at: [-0.1255, 51.5075] },
  { name: "Passfield Hall", detail: "LSE hall · 1-7 Endsleigh Place, WC1", at: [-0.13, 51.5262] },
  { name: "Rosebery Hall", detail: "LSE hall · 90 Rosebery Avenue, EC1", at: [-0.1093, 51.5265] },
  { name: "Sidney Webb House", detail: "LSE hall · 7 Great Dover Street, SE1", at: [-0.0925, 51.501] },
  // Sport
  { name: "LSE Sports Ground, Berrylands", detail: "LSE · Surbiton, KT5", at: [-0.2804, 51.3929], also: ["Berrylands"] },
];

const simple = (s: string) => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// LSE places whose name (or short name, like "SAW" or "NAB") matches what's typed.
export function searchLsePlaces(query: string, limit = 5): LsePlace[] {
  const q = simple(query.replace(/\blse\b/i, ""));
  if (!q) return query.trim().toLowerCase() === "lse" ? LSE_PLACES.slice(0, limit) : [];
  const words = q.split(" ");
  const scored = LSE_PLACES.map((p) => {
    const names = [p.name, ...(p.also ?? [])].map(simple);
    if (names.some((n) => n === q)) return { p, score: 3 };
    if (names.some((n) => n.startsWith(q))) return { p, score: 2 };
    if (names.some((n) => words.every((w) => n.split(" ").some((part) => part.startsWith(w))))) return { p, score: 1 };
    return { p, score: 0 };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.p);
}
