// Students' Union UCL's clubs and societies directory (a Drupal website).
//
// The directory page loads its cards with JavaScript. The same data is
// served as JSON at /json/anon/views/club_society_list/page_3/0/N for
// N = 0, 1, 2, …, 80 cards a page, ending with an empty page. Each card has
// card_title_field, card_link (the society's page), body_box (category),
// card_body_text_preview (one line), host_icon (the logo, as a thumbnail)
// and card_image_field (a banner, often one of the SU's holding images).
// Society page: the description is in a div with class
// field--name-field-clubsoc-body; social links are ordinary <a href>s.

import { between, textOf } from "../lib/html.mjs";
import { FetchFailed } from "../lib/polite-fetch.mjs";

const ORIGIN = "https://studentsunionucl.org";
const SU_SOCIALS = /studentsunionucl/i;

// The thumbnail is a small cropped copy; the original file is the same
// path without the image-style part.
const fullSize = (iconPath) => new URL(iconPath.replace(/\/styles\/[^/]+\/public\//, "/").replace(/\?.*$/, ""), ORIGIN).href;

export default {
  id: "ucl",
  uni: "UCL",
  su: "Students' Union UCL",
  directory: `${ORIGIN}/clubs-societies/directory`,

  async collect(fetcher, log = () => {}) {
    if (!(await fetcher.allowed(this.directory))) throw new Error("robots.txt doesn't allow the directory");
    const cards = new Map();
    for (let n = 0; n < 50; n++) {
      let page;
      try {
        page = JSON.parse(await fetcher.text(`${ORIGIN}/json/anon/views/club_society_list/page_3/0/${n}`));
      } catch (e) {
        if (n > 0 || !(e instanceof FetchFailed)) throw e;
        // The first page may only be served the way the directory page loads
        // it: as Drupal "ajax" commands with the cards inside a script.
        const ajax = JSON.parse(await fetcher.text(`${ORIGIN}/views/ajax?view_name=club_society_list&view_display_id=page_3&page=0&_wrapper_format=drupal_ajax`));
        const script = ajax.find((c) => c.command === "insert" && /cards: \{/.test(c.data ?? ""))?.data ?? "";
        page = JSON.parse(between(script.slice(script.indexOf("cards: ") + 7), /\{/, /\n\s*endpoints:|\};\s*$/).replace(/,\s*$/, ""));
      }
      const batch = page?.cards ?? page ?? {};
      const list = Object.values(batch).filter((c) => c && c.card_link);
      log(`page ${n}: ${list.length} cards`);
      if (list.length === 0) break;
      for (const c of list) cards.set(c.card_link, c);
    }

    const out = [];
    for (const c of cards.values()) {
      const page = await fetcher.text(c.card_link);
      const body = between(page, /<div[^>]*class="[^"]*field--name-field-clubsoc-body[^"]*"[^>]*>/, /<\/section>|<div class="group group--key-documents|<h2[^>]*>\s*Contact and info/i);
      const links = between(page, /header-group-club_society/, /<footer/i);
      const instagram = [...links.matchAll(/href="(https?:\/\/(?:www\.)?instagram\.com\/[^"]+)"/g)].map((m) => m[1]).find((h) => !SU_SOCIALS.test(h)) ?? "";
      const website = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>\s*(?:Visit our )?[Ww]ebsite\s*</.exec(links)?.[1] ?? "";
      // Prefer the uploaded logo; the banner is only used if it isn't one of
      // the SU's holding images.
      const banner = /Holding-Image/i.test(c.card_image_field ?? "") ? "" : (c.card_image_field ?? "");
      out.push({
        name: textOf(c.card_title_field),
        category: textOf(c.body_box ?? ""),
        description: textOf(body) || textOf(c.card_body_text_preview ?? ""),
        suUrl: c.card_link,
        logoUrl: c.host_icon ? fullSize(c.host_icon) : banner,
        instagram,
        website,
      });
    }
    return out;
  },
};
