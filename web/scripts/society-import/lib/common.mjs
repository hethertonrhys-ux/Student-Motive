// Shared helpers: CSV, names, cleaning text, and the society record shape.

// One society as collected from an SU page. Only public facts about the
// society itself: never people's names, emails, phone numbers or photos.
// { name, category, description, suUrl, logoUrl, instagram, website }

export class NotReady extends Error {}

// ---- CSV (RFC 4180: quotes around fields with commas, quotes or new lines) ----
export const CSV_COLUMNS = ["uni", "name", "category", "description", "su_url", "instagram", "website", "logo_file", "logo_sha256", "issues"];

const cell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows, columns = CSV_COLUMNS) =>
  [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((f) => f !== "")) rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.replace(/^﻿/, ""), r[i] ?? ""])));
}

// ---- Names ----
const UNI_WORDS = ["lsesu", "lse", "su", "ucl", "uclu", "kclsu", "kcl", "kings", "king s", "imperial", "icu", "ic", "union", "students union"];

// For matching the same society across the SU list and Function: lower
// case, no accents or punctuation, without the uni's name or "society".
export function nameKey(name) {
  let s = String(name ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  for (const w of UNI_WORDS) s = s.replace(new RegExp(`^${w} `), "").replace(new RegExp(` ${w}$`), "");
  return s.replace(/ (society|soc)$/, "").trim();
}

export const slugify = (s) =>
  String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

// ---- Cleaning what we keep ----
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(\+44\s?\d{2,4}|\(?0\d{2,4}\)?)[\s-]?\d{3,4}[\s-]?\d{3,4}/g;

// Plain text, single spaces, at most 600 characters. Any sentence with an
// email address or phone number in it is left out.
export function cleanDescription(text) {
  const s = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !new RegExp(EMAIL.source, "i").test(sentence) && !new RegExp(PHONE.source).test(sentence))
    .join(" ");
  if (!/[a-z]{2}/i.test(s)) return "";
  return s.length > 600 ? s.slice(0, 597).replace(/\s+\S*$/, "") + "…" : s;
}

// "@chess.lse", "instagram.com/chess.lse/" -> "chess.lse". Anything else -> "".
export function instagramHandle(value) {
  const s = String(value ?? "").trim();
  // Some SU pages double the link up ("instagram.com/https://www.instagram.com/x"), so take the last part.
  const links = [...s.matchAll(/instagram\.com\/([A-Za-z0-9._]{1,30})\/?/gi)];
  const m = links.at(-1) ?? /^@?([A-Za-z0-9._]{1,30})$/.exec(s);
  const handle = m?.[1] ?? "";
  return ["p", "reel", "explore", "accounts"].includes(handle.toLowerCase()) ? "" : handle;
}

// A website link we'd show: http(s) only, not a social network (those
// have their own fields or aren't kept), no mailto.
export function websiteLink(value) {
  try {
    const u = new URL(String(value ?? "").trim());
    if (!/^https?:$/.test(u.protocol)) return "";
    if (/(^|\.)(instagram|facebook|twitter|x|tiktok|linkedin|youtube|whatsapp|discord)\.com$/i.test(u.hostname)) return "";
    return u.href;
  } catch {
    return "";
  }
}
