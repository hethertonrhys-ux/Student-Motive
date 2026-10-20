import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { afterClaimHref, claimDmMessage, claimLinkInfo, claimLinkState, claimLinkUrl, createClaimLink, isClaimToken, redeemClaimLink } from "../src/claim-links";

const TOKEN = "0123456789abcdef".repeat(4);
// Any emoji or pictograph (the copy never uses them).
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;

// A Supabase client that fails the test if it is used at all.
const untouchable = new Proxy({}, { get: () => { throw new Error("the server was called"); } }) as unknown as SupabaseClient;

// A Supabase client whose rpc() answers once and records the call.
function rpcClient(answer: { data?: unknown; error?: unknown }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = { rpc: (fn: string, args: unknown) => { calls.push({ fn, args }); return Promise.resolve({ data: null, error: null, ...answer }); } } as unknown as SupabaseClient;
  return { client, calls };
}

describe("claim link secrets", () => {
  it("accepts exactly 64 lowercase hex characters", () => {
    expect(isClaimToken(TOKEN)).toBe(true);
    expect(isClaimToken(TOKEN.toUpperCase())).toBe(false);
    expect(isClaimToken(TOKEN.slice(1))).toBe(false);
    expect(isClaimToken(`${TOKEN}0`)).toBe(false);
    expect(isClaimToken(`${TOKEN.slice(1)}g`)).toBe(false);
    expect(isClaimToken("")).toBe(false);
    expect(isClaimToken(undefined)).toBe(false);
    expect(isClaimToken(["a"])).toBe(false);
  });
});

describe("the link and the message", () => {
  it("builds the link with or without a trailing slash on the site", () => {
    expect(claimLinkUrl("https://studentfunction.com", TOKEN)).toBe(`https://studentfunction.com/claim/${TOKEN}`);
    expect(claimLinkUrl("https://studentfunction.com/", TOKEN)).toBe(`https://studentfunction.com/claim/${TOKEN}`);
    expect(claimLinkUrl("http://localhost:8123//", TOKEN)).toBe(`http://localhost:8123/claim/${TOKEN}`);
  });

  it("writes a ready-to-paste DM with the name, the link and how long it lasts", () => {
    const url = claimLinkUrl("https://studentfunction.com", TOKEN);
    const dm = claimDmMessage("LSE Poker Society", url);
    expect(dm).toContain("LSE Poker Society");
    expect(dm).toContain("LSE Poker Society's page");
    expect(dm).toContain(url);
    expect(dm.endsWith(url)).toBe(true);
    expect(dm).toContain("7 days");
    expect(dm).toContain("Function");
    expect(dm).not.toMatch(EMOJI);
  });

  it("handles names that end in s, and a missing name", () => {
    expect(claimDmMessage("UCL Economics", "u")).toContain("UCL Economics' page");
    expect(claimDmMessage("Pilates", "u")).not.toContain("Pilates's");
    expect(claimDmMessage("  ", "u")).toContain("your society's page");
    expect(claimDmMessage("  ", "u")).not.toMatch(EMOJI);
  });

  it("sends people to their society's Hub setup after claiming", () => {
    expect(afterClaimHref("abc")).toBe("/hub/abc/setup");
  });
});

describe("the claim page", () => {
  it("calls a malformed secret unknown without asking the server", async () => {
    for (const bad of ["", "abc", TOKEN.toUpperCase(), `${TOKEN}x`, "../../etc"]) {
      const info = await claimLinkInfo(untouchable, bad);
      expect(info.status).toBe("unknown");
      expect(info.society_id).toBeNull();
      expect(info.society_name).toBeNull();
    }
  });

  it("returns what the server says about a well-formed secret", async () => {
    const row = { status: "ready", society_id: "s1", society_name: "Chess", society_slug: "chess", logo_url: null, university: "UCL", expires_at: "2026-11-01T00:00:00Z" };
    const { client, calls } = rpcClient({ data: [row] });
    expect(await claimLinkInfo(client, TOKEN)).toEqual(row);
    expect(calls).toEqual([{ fn: "claim_link_info", args: { token: TOKEN } }]);
  });

  it("treats no row or an unexpected status as unknown, and throws when the server fails", async () => {
    expect((await claimLinkInfo(rpcClient({ data: [] }).client, TOKEN)).status).toBe("unknown");
    expect((await claimLinkInfo(rpcClient({ data: [{ status: "weird" }] }).client, TOKEN)).status).toBe("unknown");
    await expect(claimLinkInfo(rpcClient({ error: { message: "network" } }).client, TOKEN)).rejects.toBeTruthy();
  });

  it("refuses a malformed secret without asking the server", async () => {
    expect((await redeemClaimLink(untouchable, "nope")).error).toBeTruthy();
  });

  it("passes the database's own messages through and hides anything else", async () => {
    const used = await redeemClaimLink(rpcClient({ error: { message: "This link has already been used" } }).client, TOKEN);
    expect(used).toEqual({ error: "This link has already been used" });
    const odd = await redeemClaimLink(rpcClient({ error: { message: 'duplicate key value violates unique constraint "x"' } }).client, TOKEN);
    expect(odd).toEqual({ error: "Couldn't claim it. Try again." });
    const { client, calls } = rpcClient({ data: "society-1" });
    expect(await redeemClaimLink(client, TOKEN)).toEqual({ societyId: "society-1" });
    expect(calls).toEqual([{ fn: "redeem_society_claim_link", args: { token: TOKEN } }]);
  });
});

describe("the admin panel", () => {
  it("returns a new link's id and secret, or a message", async () => {
    const { client, calls } = rpcClient({ data: [{ id: "l1", token: TOKEN }] });
    expect(await createClaimLink(client, "s1")).toEqual({ id: "l1", token: TOKEN });
    expect(calls).toEqual([{ fn: "create_society_claim_link", args: { sid: "s1" } }]);
    expect((await createClaimLink(rpcClient({ error: { message: "Function admins only" } }).client, "s1")).error).toBeTruthy();
    expect((await createClaimLink(rpcClient({ data: [] }).client, "s1")).error).toBeTruthy();
    expect((await createClaimLink(rpcClient({ data: [{ id: "l1", token: "nope" }] }).client, "s1")).error).toBeTruthy();
  });

  it("works out where each link is", () => {
    const now = Date.parse("2026-11-01T12:00:00Z");
    const base = { expires_at: "2026-11-05T00:00:00Z", used_at: null, revoked_at: null };
    expect(claimLinkState(base, now)).toBe("ready");
    expect(claimLinkState({ ...base, expires_at: "2026-11-01T11:59:59Z" }, now)).toBe("expired");
    expect(claimLinkState({ ...base, expires_at: "2026-10-01T00:00:00Z", used_at: "2026-09-30T00:00:00Z" }, now)).toBe("used");
    expect(claimLinkState({ ...base, revoked_at: "2026-11-01T00:00:00Z" }, now)).toBe("revoked");
  });
});
