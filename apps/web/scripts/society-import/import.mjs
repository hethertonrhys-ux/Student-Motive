// Step 2 (after you've reviewed the CSV): put the societies on Function.
//
//   npm run societies:import -- --dry-run      shows what would change, changes nothing
//   npm run societies:import                   does it
//   (options: --csv path/to/societies.csv)
//
// Needs, in web/.env.local on your own computer (never shared or committed):
//   NEXT_PUBLIC_SUPABASE_URL=...      (already there)
//   SUPABASE_SECRET_KEY=...           (Supabase -> Project Settings -> API Keys -> Secret key)
//
// Rules:
// - New societies are created unclaimed, linked to their uni, with
//   source "su_directory" and the SU page they came from.
// - A society already on Function (same uni and name, or same SU page) is
//   matched instead of duplicated. If its committee has claimed or edited
//   it, it's left exactly as it is. Otherwise only its empty fields are filled.
// - Logos go to the same storage as logos uploaded in the app. Missing or
//   placeholder logos are left empty, so the page shows the default avatar.
// - Safe to run again: anything already imported is matched, not added twice.

import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { nameKey, parseCsv, slugify } from "./lib/common.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const dryRun = process.argv.includes("--dry-run");
const csvPath = arg("csv", join(here, "out", "societies.csv"));
const outDir = dirname(csvPath);

// Settings from web/.env.local (or the environment).
const envFile = join(here, "..", "..", ".env.local");
const env = { ...process.env };
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY to web/.env.local first (see the top of this file).");
  process.exit(1);
}
if (!existsSync(csvPath)) {
  console.error(`No CSV at ${csvPath}. Run npm run societies:collect first.`);
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const UNIS = { LSE: "lse", UCL: "ucl", KCL: "kcl", Imperial: "imperial" };
const LOGO_TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const MAX_LOGO = 5 * 1024 * 1024;

async function all(table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`Couldn't read ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const existing = await all("societies", "id, slug, name, university, description, logo_url, instagram, website, source, source_url, committee_edited_at");
const claimed = new Set((await all("society_admins", "society_id")).map((a) => a.society_id));
const slugs = new Set(existing.map((s) => s.slug));
const byKey = new Map(existing.map((s) => [`${s.university}|${nameKey(s.name)}`, s]));
const bySource = new Map(existing.filter((s) => s.source_url).map((s) => [s.source_url, s]));

function freeSlug(name, uni) {
  const base = slugify(name) || "society";
  for (const candidate of [base, `${base}-${UNIS[uni]}`]) if (!slugs.has(candidate)) return candidate;
  for (let n = 2; ; n++) if (!slugs.has(`${base}-${UNIS[uni]}-${n}`)) return `${base}-${UNIS[uni]}-${n}`;
}

// A logo we can use: a JPG, PNG or WebP under 5MB that isn't a placeholder.
function usableLogo(row) {
  if (!row.logo_file || /placeholder|default avatar/.test(row.issues)) return null;
  const type = LOGO_TYPES[extname(row.logo_file).toLowerCase()];
  const file = join(outDir, row.logo_file);
  if (!type || !existsSync(file)) return null;
  const body = readFileSync(file);
  return body.length <= MAX_LOGO ? { body, type, ext: extname(row.logo_file).toLowerCase().replace(".jpeg", ".jpg") } : null;
}

async function uploadLogo(societyId, logo, sha) {
  const path = `${societyId}/logo-${(sha || "").slice(0, 8) || "su"}${logo.ext}`;
  const { error } = await supabase.storage.from("images").upload(path, logo.body, { contentType: logo.type, upsert: true });
  if (error) throw new Error(`logo upload failed: ${error.message}`);
  return supabase.storage.from("images").getPublicUrl(path).data.publicUrl;
}

const rows = parseCsv(readFileSync(csvPath, "utf8"));
const counts = { created: 0, filled: 0, unchanged: 0, keptClaimed: 0, skipped: 0, logos: 0, failed: 0 };
const seenInCsv = new Set();
console.log(`${dryRun ? "DRY RUN: nothing will be changed.\n" : ""}${rows.length} rows in ${csvPath}\n`);

for (const row of rows) {
  const uni = row.uni?.trim();
  const name = row.name?.replace(/\s+/g, " ").trim();
  if (!UNIS[uni] || !name) {
    console.log(`SKIP     ${uni || "?"} "${name || ""}": needs a uni (LSE, UCL, KCL or Imperial) and a name`);
    counts.skipped++;
    continue;
  }
  const k = `${uni}|${nameKey(name)}`;
  if (seenInCsv.has(k)) {
    console.log(`SKIP     ${uni} "${name}": same society as an earlier row in the CSV`);
    counts.skipped++;
    continue;
  }
  seenInCsv.add(k);
  const fields = {
    description: row.description?.trim() || null,
    instagram: row.instagram?.trim() || null,
    website: row.website?.trim() || null,
  };
  const logo = usableLogo(row);
  const match = (row.su_url && bySource.get(row.su_url)) || byKey.get(k);

  try {
    if (!match) {
      const slug = freeSlug(name, uni);
      slugs.add(slug);
      console.log(`CREATE   ${uni} "${name}" -> /s/${slug}${logo ? " (with logo)" : " (default avatar)"}`);
      counts.created++;
      if (logo) counts.logos++;
      if (dryRun) continue;
      const { data, error } = await supabase
        .from("societies")
        .insert({ name, slug, kind: "society", university: uni, is_verified: false, ...fields, source: "su_directory", source_url: row.su_url || null, imported_at: new Date().toISOString() })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      if (logo) await supabase.from("societies").update({ logo_url: await uploadLogo(data.id, logo, row.logo_sha256) }).eq("id", data.id);
      continue;
    }

    if (claimed.has(match.id) || match.committee_edited_at) {
      console.log(`KEEP     ${uni} "${name}": already run by its committee (/s/${match.slug}), not touched`);
      counts.keptClaimed++;
      continue;
    }
    // Unclaimed and unedited: only fill what's empty.
    const fill = {};
    for (const [field, value] of Object.entries(fields)) if (value && !match[field]) fill[field] = value;
    if (row.su_url && !match.source_url) fill.source_url = row.su_url;
    const addLogo = logo && !match.logo_url;
    if (!Object.keys(fill).length && !addLogo) {
      console.log(`SAME     ${uni} "${name}" (/s/${match.slug}): nothing new`);
      counts.unchanged++;
      continue;
    }
    console.log(`FILL     ${uni} "${name}" (/s/${match.slug}): ${[...Object.keys(fill), ...(addLogo ? ["logo"] : [])].join(", ")}`);
    counts.filled++;
    if (addLogo) counts.logos++;
    if (dryRun) continue;
    if (addLogo) fill.logo_url = await uploadLogo(match.id, logo, row.logo_sha256);
    const { error } = await supabase.from("societies").update(fill).eq("id", match.id);
    if (error) throw new Error(error.message);
  } catch (e) {
    console.log(`FAILED   ${uni} "${name}": ${e.message}`);
    counts.failed++;
  }
}

console.log(
  `\n${dryRun ? "Would create" : "Created"} ${counts.created}, ${dryRun ? "would fill in" : "filled in"} ${counts.filled}, ` +
    `nothing new for ${counts.unchanged}, left ${counts.keptClaimed} claimed/edited ones alone, skipped ${counts.skipped}` +
    `${counts.failed ? `, ${counts.failed} FAILED` : ""}. Logos: ${counts.logos}.`,
);
if (dryRun) console.log("Run again without --dry-run to make these changes.");
