// Step 1 (review): read each students' union's public society directory
// and write a CSV plus a folder of logos for you to check. Nothing is
// written to the database.
//
//   npm run societies:collect -- --contact you@example.com [--only lse,ucl] [--out dir] [--sites dir]
//
// Pages are cached in <out>/cache, so running it again doesn't hit the
// SU websites again (delete that folder to fetch fresh pages).

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NotReady, cleanDescription, instagramHandle, nameKey, slugify, toCsv, websiteLink } from "./lib/common.mjs";
import { FetchFailed, PoliteFetcher, RobotsDisallowed } from "./lib/polite-fetch.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const contact = arg("contact");
if (!contact) {
  console.error("Add --contact <email> so the SU websites know who's asking (it goes in the user agent).");
  process.exit(1);
}
const outDir = arg("out", join(here, "out"));
const sitesDir = arg("sites", join(here, "sites"));
const only = arg("only")?.split(",").map((s) => s.trim().toLowerCase());
const minIntervalMs = Number(arg("interval-ms", 1000));

const fetcher = new PoliteFetcher({ contact, cacheDir: join(outDir, "cache"), minIntervalMs, log: (m) => console.log("  " + m) });
const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg" };
const SHORT_DESCRIPTION = 40;
// The same picture on this many societies at one uni is the SU's default image.
const PLACEHOLDER_REPEATS = 3;

const sites = [];
for (const file of readdirSync(sitesDir).filter((f) => f.endsWith(".mjs")).sort()) {
  const site = (await import(pathToFileURL(join(sitesDir, file)).href)).default;
  if (!only || only.includes(site.id)) sites.push(site);
}

const rows = [];
const report = [];
// Each site is read in turn, but the sites run side by side: the one
// request a second limit is per website, so they don't slow each other.
await Promise.all(sites.map((site) => readSite(site)));
async function readSite(site) {
  console.log(`${site.su} (${site.uni}): ${site.directory}`);
  let found;
  try {
    found = await site.collect(fetcher, (m) => console.log(`  [${site.id}] ${m}`));
  } catch (e) {
    const why =
      e instanceof NotReady ? e.message
      : e instanceof RobotsDisallowed ? `robots.txt doesn't allow ${e.url}`
      : e instanceof FetchFailed ? e.message
      : `couldn't read the site (${e.message})`;
    console.log(`  [${site.id}] SKIPPED: ${why}`);
    report.push({ site, skipped: why });
    return;
  }

  const logoDir = join(outDir, "logos", site.id);
  mkdirSync(logoDir, { recursive: true });
  const siteRows = [];
  for (const s of found) {
    const name = String(s.name ?? "").replace(/\s+/g, " ").trim();
    if (!name) continue;
    const row = {
      uni: site.uni,
      name,
      category: String(s.category ?? "").trim(),
      description: cleanDescription(s.description),
      su_url: s.suUrl ?? "",
      instagram: instagramHandle(s.instagram),
      website: websiteLink(s.website),
      logo_file: "",
      logo_sha256: "",
      issues: [],
    };
    if (s.logoUrl) {
      try {
        const res = await fetcher.get(new URL(s.logoUrl, s.suUrl || site.directory).href);
        const type = res.contentType.split(";")[0].trim().toLowerCase();
        if (!IMAGE_TYPES[type]) row.issues.push(`logo isn't an image (${type || "unknown type"})`);
        else {
          const file = join(logoDir, `${slugify(name) || "society"}.${IMAGE_TYPES[type]}`);
          writeFileSync(file, res.body);
          row.logo_file = relative(outDir, file);
          row.logo_sha256 = createHash("sha256").update(res.body).digest("hex");
          if (!["jpg", "png", "webp"].includes(IMAGE_TYPES[type])) row.issues.push(`logo is ${IMAGE_TYPES[type]}: will use the default avatar`);
        }
      } catch (e) {
        row.issues.push(`logo not downloaded (${e instanceof RobotsDisallowed ? "robots.txt" : e.message})`);
      }
    } else row.issues.push("no logo");
    if (row.description.length < SHORT_DESCRIPTION) row.issues.push(row.description ? "very short description" : "no description");
    siteRows.push(row);
  }

  // The same picture on many societies is the SU's placeholder.
  const byHash = new Map();
  for (const r of siteRows) if (r.logo_sha256) byHash.set(r.logo_sha256, (byHash.get(r.logo_sha256) ?? 0) + 1);
  for (const r of siteRows) if (r.logo_sha256 && byHash.get(r.logo_sha256) >= PLACEHOLDER_REPEATS) r.issues.push("placeholder logo: will use the default avatar");
  // Likely the same society listed twice.
  const byKey = new Map();
  for (const r of siteRows) byKey.set(nameKey(r.name), [...(byKey.get(nameKey(r.name)) ?? []), r]);
  for (const group of byKey.values()) if (group.length > 1) for (const r of group) r.issues.push(`possible duplicate of ${group.filter((o) => o !== r).map((o) => `"${o.name}"`).join(", ")}`);

  rows.push(...siteRows);
  report.push({
    site,
    found: siteRows.length,
    logos: siteRows.filter((r) => r.logo_file && !r.issues.some((i) => i.startsWith("placeholder"))).length,
    flagged: siteRows.filter((r) => r.issues.length).length,
  });
}

rows.sort((a, b) => a.uni.localeCompare(b.uni) || a.name.localeCompare(b.name));
report.sort((a, b) => a.site.uni.localeCompare(b.site.uni));
mkdirSync(outDir, { recursive: true });
const csvPath = join(outDir, "societies.csv");
writeFileSync(csvPath, "﻿" + toCsv(rows.map((r) => ({ ...r, issues: r.issues.join("; ") }))));

console.log("\nSummary");
for (const r of report) {
  console.log(r.skipped ? `  ${r.site.uni}: skipped (${r.skipped})` : `  ${r.site.uni}: ${r.found} found, ${r.logos} with a real logo, ${r.flagged} flagged`);
}
console.log(`\nReview: ${csvPath}\nLogos:  ${join(outDir, "logos")}\nDelete any rows you don't want, then run the import with --dry-run first.`);
