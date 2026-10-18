// Small helpers for reading the SU pages (plain regexes: the pages are
// simple and we only need a few fields from each).

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ouml: "ö", uuml: "ü", auml: "ä", ntilde: "ñ", copy: "©", pound: "£", euro: "€", middot: "·", bull: "•", trade: "™", deg: "°" };

export function decode(text) {
  return String(text ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED[name.toLowerCase()] ?? m);
}

// Visible text of an HTML fragment: no tags, scripts or styles; paragraphs
// become single spaces (cleanDescription tidies the rest).
export function textOf(fragment) {
  return decode(
    String(fragment ?? "")
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

// The part of the page between the first match of `from` and the next
// match of `to` after it ("" if `from` isn't found).
export function between(page, from, to) {
  const start = page.search(from);
  if (start < 0) return "";
  const rest = page.slice(start);
  const end = rest.slice(1).search(to);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

export const attr = (tag, name) => decode(new RegExp(`\\b${name}="([^"]*)"`, "i").exec(tag)?.[1] ?? "");

// First href in a fragment that points at one of these hosts.
export function linkTo(fragment, hosts) {
  for (const m of String(fragment ?? "").matchAll(/href="([^"]+)"/g)) {
    const href = decode(m[1]).replace(/^\/\//, "https://");
    try {
      const u = new URL(href);
      if (hosts.some((h) => u.hostname === h || u.hostname.endsWith("." + h))) return href;
    } catch {
      // not an absolute link
    }
  }
  return "";
}
