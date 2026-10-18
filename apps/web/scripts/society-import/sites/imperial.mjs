// Imperial College Union's Club, Society & Project A to Z (a Next.js site).
//
// The A to Z page carries every group in its page data as JSON like
//   {"id":65,"name":"ABACUS","thumbnail_url":"https://sums-data-public.sums.digital/…",
//    "header_image_url":null,"activity_category_id":9,"url_name":"abacus",
//    "badges":[],"category":{"id":9,"name":"Cultural","slug":"cultural"}}
// Group page (/activities/a-to-z/URL_NAME): "Category: …", then a
// "Social media links" block of <a href>s, then the description under an
// <h2>Welcome to …</h2> heading.
//
// Projects: the website doesn't say which groups are projects rather than
// clubs or societies (there's no type field or label), so they can't be
// left out automatically. Delete them from the CSV before importing.
// Logos are on sums-data-public.sums.digital, a separate host.

import { between, linkTo, textOf } from "../lib/html.mjs";

const ORIGIN = "https://www.imperialcollegeunion.org";
const UNION_LINKS = /imperialcollegeunion\.org|imperial\.ac\.uk|union\.ic\.ac\.uk/i;

export default {
  id: "imperial",
  uni: "Imperial",
  su: "Imperial College Union",
  directory: `${ORIGIN}/activities/a-to-z`,

  async collect(fetcher, log = () => {}) {
    const page = (await fetcher.text(this.directory)).replace(/\\"/g, '"');
    const groups = new Map();
    for (const m of page.matchAll(/\{"id":\d+,"name":"[^"]*","thumbnail_url":"[^"]*","header_image_url":(?:null|"[^"]*"),"activity_category_id":\d+,"url_name":"[^"]*","badges":\[[^\]]*\],"category":\{[^{}]*\}\}/g)) {
      try {
        const g = JSON.parse(m[0]);
        if (g.url_name && !groups.has(g.url_name)) groups.set(g.url_name, g);
      } catch {
        // not one of the group entries
      }
    }
    log(`${groups.size} groups listed`);

    const out = [];
    for (const g of groups.values()) {
      const suUrl = `${ORIGIN}/activities/a-to-z/${g.url_name}`;
      const html = await fetcher.text(suUrl);
      const socials = between(html, /Social media links/, /<h2|Join Now/i);
      const about = between(html, /<h2[^>]*>\s*Welcome to/i, /<h2[^>]*>\s*(Are you interested|Products|The committee)/i);
      const website = [...socials.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]).find((h) => !UNION_LINKS.test(h) && !/instagram|facebook|twitter|x\.com|tiktok|linkedin|discord|youtube|mailto/i.test(h)) ?? "";
      out.push({
        name: textOf(g.name),
        category: textOf(g.category?.name ?? ""),
        description: textOf(about.replace(/<h2[^>]*>[\s\S]*?<\/h2>/, "")),
        suUrl,
        logoUrl: g.thumbnail_url || "",
        instagram: linkTo(socials, ["instagram.com"]),
        website,
      });
    }
    return out;
  },
};
