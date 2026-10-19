// Link previews for shared links (WhatsApp, iMessage, Instagram, Slack…).
//
// The web app is drawn in the browser, so a crawler fetching /e/<id> would
// see an empty page. vercel.json sends crawlers (by user agent) here
// instead, and this builds a tiny page with the title, time, place and
// image as <meta> tags. People never see it: they get the app.
//
// Reads only what anyone logged out can read (the public key and the
// database's own row rules). No secrets.

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || "https://studentfunction.com").replace(/\/$/, "");
const SITE_NAME = "Function";
const DEFAULT_DESCRIPTION = "London's student social life, all in one place. Societies, events and socials for students at LSE, UCL, King's and Imperial, on one live map.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONDON = "Europe/London";

async function fetchRow(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}&limit=1`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: "application/json" },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

// The same words as the app's formatEventTime: "Thu 5 Mar, 19:00–22:00".
const dayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: LONDON });
const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: LONDON });
function formatEventTime(startIso, endIso) {
  const start = new Date(startIso), end = new Date(endIso);
  const startDay = dayFormat.format(start), endDay = dayFormat.format(end);
  const endHour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: LONDON }).format(end));
  const overnight = startDay !== endDay && end - start < 12 * 3600 * 1000 && endHour < 6;
  if (startDay === endDay || overnight) return `${startDay}, ${timeFormat.format(start)}–${timeFormat.format(end)}`;
  return `${startDay}, ${timeFormat.format(start)} – ${endDay}, ${timeFormat.format(end)}`;
}
const formatWhen = (iso) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: LONDON }).format(new Date(iso));

// What to show for each kind of link. Returns null when there's nothing to show.
async function describe(path) {
  const [, kind, id] = path.match(/^\/(e|s|social)\/([^/?#]+)/) || [];
  if (!kind) return null;
  if (kind === "e") {
    if (!UUID.test(id)) return null;
    const event = await fetchRow("events", `id=eq.${id}&select=title,starts_at,ends_at,location_note,image_url,venues(name),societies(name)`);
    if (!event) return null;
    const place = (event.venues && event.venues.name) || event.location_note || "";
    const description = `${formatEventTime(event.starts_at, event.ends_at)} · ${place}${event.societies ? ` · ${event.societies.name}` : ""}`;
    return { title: event.title, description, image: event.image_url || null };
  }
  if (kind === "s") {
    const society = await fetchRow("societies", `slug=eq.${encodeURIComponent(id)}&select=name,description,logo_url`);
    if (!society) return null;
    return { title: society.name, description: society.description || `Upcoming events from ${society.name} on Function.`, image: society.logo_url || null };
  }
  if (!UUID.test(id)) return null;
  const social = await fetchRow("social_events", `id=eq.${id}&select=title,starts_at,area`);
  if (!social) return null;
  return { title: social.title, description: `${formatWhen(social.starts_at)} · ${social.area}` };
}

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function page({ title, description, image, url }) {
  const meta = [
    ["name", "description", description],
    ["property", "og:site_name", SITE_NAME],
    ["property", "og:type", "website"],
    ["property", "og:title", title],
    ["property", "og:description", description],
    ["property", "og:url", url],
    ["property", "og:image", image || `${SITE_URL}/icon-512.png`],
    ["name", "twitter:card", image ? "summary_large_image" : "summary"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", description],
  ].map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escape(value)}">`).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)} · ${SITE_NAME}</title>\n${meta}\n<link rel="canonical" href="${escape(url)}"></head><body><p><a href="${escape(url)}">${escape(title)}</a></p></body></html>`;
}

module.exports = async function handler(req, res) {
  const path = String((req.query && req.query.path) || "/");
  const url = `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  let found = null;
  try {
    if (SUPABASE_URL && SUPABASE_KEY) found = await describe(path);
  } catch {
    // The database didn't answer: fall back to the site's own description.
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
  res.status(found ? 200 : 404).send(page(found ? { ...found, url } : { title: /^\/(e|s|social)\//.test(path) ? "Not found" : "London's student social life", description: DEFAULT_DESCRIPTION, image: null, url }));
};
