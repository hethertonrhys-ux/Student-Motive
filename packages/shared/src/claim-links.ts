import type { SupabaseClient } from "@supabase/supabase-js";
import { getCards } from "./social";

// Instant claim links: a Function admin makes a one-off link for a society
// and sends it to the committee (usually in an Instagram DM). Whoever opens
// it and logs in becomes a manager of that society straight away. The link
// works once and lasts 7 days. The database makes the secret, stores only
// its hash, and checks every step (supabase/migrations/20261118000000_society_claim_links.sql).

type Result = { error?: string };

// The secret in a claim link: 64 lowercase hex characters.
export const CLAIM_TOKEN = /^[0-9a-f]{64}$/;
export const isClaimToken = (s: unknown): s is string => typeof s === "string" && CLAIM_TOKEN.test(s);

// The link to send: <site>/claim/<secret>.
export const claimLinkUrl = (siteUrl: string, token: string) => `${siteUrl.replace(/\/+$/, "")}/claim/${token}`;

// Where someone goes once they've claimed a society. Part 3 (the Society
// Hub) will change this to the Hub's setup; it's the one place to change.
export const afterClaimHref = (societyId: string) => `/dashboard/${societyId}?claimed=1`;

const possessive = (name: string) => (/['’]s$/i.test(name) ? name : /s$/i.test(name) ? `${name}'` : `${name}'s`);

// A short, friendly message to paste into an Instagram DM with the link.
export function claimDmMessage(societyName: string, url: string): string {
  const name = societyName.trim() || "there";
  const page = societyName.trim() ? `${possessive(name)} page` : "your society's page";
  return `Hi ${name}! We've set up ${page} on Function, where London students find what's on. Claim it here and post your first event in about 5 minutes (the link works once and lasts 7 days): ${url}`;
}

// ---- The claim page (anyone, even logged out) ----

// ready: can be claimed. used_by_you: you already claimed it (opening it
// again is fine). used / expired / revoked: can't be claimed any more.
// unknown: not a link we made.
export type ClaimLinkStatus = "ready" | "used" | "used_by_you" | "expired" | "revoked" | "unknown";
export type ClaimLinkInfo = {
  status: ClaimLinkStatus;
  society_id: string | null;
  society_name: string | null;
  society_slug: string | null;
  logo_url: string | null;
  university: string | null;
  expires_at: string | null;
};

const UNKNOWN: ClaimLinkInfo = { status: "unknown", society_id: null, society_name: null, society_slug: null, logo_url: null, university: null, expires_at: null };
const STATUSES: ClaimLinkStatus[] = ["ready", "used", "used_by_you", "expired", "revoked", "unknown"];

// What a link is for and whether it still works. A malformed secret is
// "unknown" without asking the server. Throws if the server can't be reached.
export async function claimLinkInfo(supabase: SupabaseClient, token: string): Promise<ClaimLinkInfo> {
  if (!isClaimToken(token)) return UNKNOWN;
  const { data, error } = await supabase.rpc("claim_link_info", { token });
  if (error) throw error;
  const row = ((data ?? []) as ClaimLinkInfo[])[0];
  if (!row || !STATUSES.includes(row.status)) return UNKNOWN;
  return row;
}

// The database's own messages, safe to show as they are.
const CLAIM_ERRORS = ["Log in first", "This link isn't valid", "This link has been cancelled", "This link has already been used", "This link has expired"];

// Claim the society: you become one of its managers. Opening the same link
// again (e.g. refreshing the page) is fine.
export async function redeemClaimLink(supabase: SupabaseClient, token: string): Promise<{ societyId?: string; error?: string }> {
  if (!isClaimToken(token)) return { error: "This link isn't valid" };
  const { data, error } = await supabase.rpc("redeem_society_claim_link", { token });
  if (error) return { error: CLAIM_ERRORS.find((m) => error.message?.includes(m)) ?? "Couldn't claim it. Try again." };
  if (typeof data !== "string" || !data) return { error: "Couldn't claim it. Try again." };
  return { societyId: data };
}

// ---- The admin panel (Function admins only; the database refuses anyone else) ----

// Make a link for a society. Its id and secret come back once; the secret
// isn't stored, so show it (or the message) straight away.
export async function createClaimLink(supabase: SupabaseClient, societyId: string): Promise<{ id?: string; token?: string; error?: string }> {
  const { data, error } = await supabase.rpc("create_society_claim_link", { sid: societyId });
  const row = (Array.isArray(data) ? data[0] : data) as { id?: unknown; token?: unknown } | undefined;
  if (error || !row || typeof row.id !== "string" || !isClaimToken(row.token)) return { error: "Couldn't create a link. Try again." };
  return { id: row.id, token: row.token };
}

export type ClaimLinkState = "ready" | "used" | "expired" | "revoked";
export type ClaimLinkRow = {
  id: string;
  society_id: string;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  used_by: string | null;
  used_at: string | null;
  revoked_at: string | null;
  // Names (never emails) of who made it and who used it.
  created_by_name: string | null;
  used_by_name: string | null;
};

// Where a link is now. A used link stays "used" even after it would have
// expired (or if the person who used it has since deleted their account).
export function claimLinkState(link: Pick<ClaimLinkRow, "expires_at" | "used_at" | "revoked_at">, now = Date.now()): ClaimLinkState {
  if (link.revoked_at) return "revoked";
  if (link.used_at) return "used";
  if (new Date(link.expires_at).getTime() <= now) return "expired";
  return "ready";
}

// A society's links, newest first, with who made and used each.
export async function listClaimLinks(supabase: SupabaseClient, societyId: string): Promise<ClaimLinkRow[]> {
  const { data, error } = await supabase
    .from("society_claim_links")
    .select("id, society_id, created_by, created_at, expires_at, used_by, used_at, revoked_at")
    .eq("society_id", societyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Omit<ClaimLinkRow, "created_by_name" | "used_by_name">[];
  const cards = await getCards(supabase, rows.flatMap((r) => [r.created_by, r.used_by]).filter((x): x is string => !!x));
  return rows.map((r) => ({ ...r, created_by_name: r.created_by ? (cards.get(r.created_by)?.name ?? null) : null, used_by_name: r.used_by ? (cards.get(r.used_by)?.name ?? null) : null }));
}

// Cancel a link that hasn't been used yet.
export async function revokeClaimLink(supabase: SupabaseClient, linkId: string): Promise<Result> {
  const { error } = await supabase.rpc("revoke_society_claim_link", { link_id: linkId });
  return error ? { error: "Couldn't cancel it. Try again." } : {};
}
