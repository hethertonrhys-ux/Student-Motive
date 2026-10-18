// LSESU's public directories (an MSL website).
//
// Lists: /communities/societies/search/ lists every society on one page,
// and /communities/clubs/ every sports club. Each entry is
//   <li data-msl-organisation-id=".." data-msl-grouping-id="ID">
//     <a class="msl-gl-link" href="/communities/societies/group/SLUG/">Name</a>
//     <dl class="msl-gl-attributes">...<dd class="msl-gl-attribute">Category</dd>
// Group page: <h1>Name</h1>, the description inside <div id="organisation">,
// social links as <a class="msl-icon msl_instagram" href="//instagram.com/x">.
//
// Logos: the site's robots.txt disallows /asset/, where every logo lives,
// so logos can't be downloaded (the fetcher refuses and the CSV says so).

import { attr, between, linkTo, textOf } from "../lib/html.mjs";

const ORIGIN = "https://www.lsesu.com";

export default {
  id: "lse",
  uni: "LSE",
  su: "LSESU",
  directory: `${ORIGIN}/communities/societies/search/`,
  lists: [
    { url: `${ORIGIN}/communities/societies/search/`, fallbackCategory: "" },
    { url: `${ORIGIN}/communities/clubs/`, fallbackCategory: "Sports club" },
  ],

  async collect(fetcher, log = () => {}) {
    const seen = new Map();
    for (const list of this.lists) {
      const page = await fetcher.text(list.url);
      const items = page.matchAll(/<li data-msl-organisation-id="[^"]*" data-msl-grouping-id="(\d+)">\s*<a class="msl-gl-link" href="([^"]+)">([^<]*)<\/a>([\s\S]*?)<\/li>/g);
      let count = 0;
      for (const [, groupId, href, name, rest] of items) {
        if (seen.has(groupId)) continue;
        const category = textOf(/<dd class="msl-gl-attribute">([^<]*)/.exec(rest)?.[1] ?? "") || list.fallbackCategory;
        seen.set(groupId, { name: textOf(name), category, suUrl: new URL(href, ORIGIN).href });
        count++;
      }
      log(`${count} groups listed at ${list.url}`);
    }

    const out = [];
    for (const entry of seen.values()) {
      const page = await fetcher.text(entry.suUrl);
      const about = between(page, /<div id="organisation">/, /<hr|<footer|<!-- *(Events|Products|Committee)/i);
      const instagram = linkTo(page.match(/<a class="msl-icon msl_instagram"[^>]*>/)?.[0] ?? "", ["instagram.com"]);
      const websiteTag = /<a class="msl-icon msl_website" href="([^"]*)"/.exec(page);
      const logo = attr(/<meta property="og:image"[^>]*>/.exec(page)?.[0] ?? "", "content");
      out.push({
        ...entry,
        name: textOf(/<h1[^>]*>([^<]*)/.exec(page)?.[1] ?? "") || entry.name,
        description: textOf(about.replace(/<img[^>]*>/g, "")),
        logoUrl: logo || "",
        instagram,
        website: websiteTag ? websiteTag[1] : "",
      });
    }
    return out;
  },
};
