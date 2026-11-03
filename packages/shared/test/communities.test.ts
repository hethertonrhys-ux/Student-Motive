import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { fetchMessagesAfter, fetchMessagesPage, isNote, leaveChat, loadShareTargets, loadThreadInfo } from "../src/chats";
import {
  DEFAULT_ROLE_COLOURS,
  isMutedNow,
  joinUrl,
  muteUntil,
  nicknameKey,
  normaliseRoleColours,
  requestToJoinCommunity,
  roleColour,
  roleTag,
  setThreadMute,
  validateNickname,
} from "../src/communities";
import {
  chunk,
  mapLimit,
  planDeliveries,
  readExpoAnswer,
  sendExpoRequest,
  settle,
  webOutcome,
  type QueueRow,
  type TokenRow,
} from "../../../supabase/functions/send-push/batching";

// Communities (docs/COMMUNITIES_PLAN.md): role colours and tags, nicknames,
// the join link, mutes, paging through a chat, and send-push's batching.

type Res = { data: unknown; error: { code?: string; message?: string } | null; status?: number };

// A Supabase client whose queries and RPCs record each call and answer with
// `answer` (given the table or function and the calls made) when awaited.
function fakeClient(answer: (name: string, calls: string[]) => Res) {
  const queries: { name: string; calls: string[] }[] = [];
  const record = (name: string, calls: string[]) => {
    queries.push({ name, calls });
    const query: object = new Proxy(
      {},
      {
        get: (_target, prop) =>
          prop === "then"
            ? (ok: (r: Res) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(answer(name, calls)).then(ok, fail)
            : (...args: unknown[]) => {
                calls.push(`${String(prop)}(${args.map((a) => JSON.stringify(a)).join(",")})`);
                return query;
              },
      },
    );
    return query;
  };
  const client = {
    from: (table: string) => record(table, []),
    rpc: (fn: string, args: unknown) => record(`rpc:${fn}`, [`args(${JSON.stringify(args)})`]),
  };
  return { client: client as unknown as SupabaseClient, queries };
}

const THREAD = "11111111-1111-4111-8111-111111111111";
const MSG = "22222222-2222-4222-8222-222222222222";
const SAM = "33333333-3333-4333-8333-333333333333";

describe("role colours", () => {
  it("goes admin, then committee, then paying member, then everyone else", () => {
    expect(roleColour(DEFAULT_ROLE_COLOURS, "admin", "member", "light")).toBe("#8A5A00");
    expect(roleColour(DEFAULT_ROLE_COLOURS, "committee", "member", "light")).toBe("#7A1010");
    expect(roleColour(DEFAULT_ROLE_COLOURS, "regular", "member", "light")).toBe("#C4362E");
    expect(roleColour(DEFAULT_ROLE_COLOURS, "regular", "non_member", "light")).toBe("#6B6B73");
    expect(roleColour(DEFAULT_ROLE_COLOURS, null, null, "light")).toBe("#6B6B73");
  });

  it("has a dark-mode colour for each", () => {
    expect(roleColour(DEFAULT_ROLE_COLOURS, "admin", "non_member", "dark")).toBe("#F5C04A");
    expect(roleColour(DEFAULT_ROLE_COLOURS, "committee", "non_member", "dark")).toBe("#FF5A5A");
    expect(roleColour(DEFAULT_ROLE_COLOURS, "regular", "member", "dark")).toBe("#FFB8B3");
    expect(roleColour(DEFAULT_ROLE_COLOURS, "regular", "non_member", "dark")).toBe("#9A9AA3");
  });

  it("uses the community's own colours", () => {
    const colours = { ...DEFAULT_ROLE_COLOURS, admin: { light: "#000000", dark: "#FFFFFF" } };
    expect(roleColour(colours, "admin", null, "light")).toBe("#000000");
    expect(roleColour(colours, "admin", null, "dark")).toBe("#FFFFFF");
  });

  it("falls back to the defaults when settings are missing or malformed", () => {
    expect(roleColour(undefined, "admin", null, "light")).toBe("#8A5A00");
    expect(roleColour(null, "committee", null, "dark")).toBe("#FF5A5A");
    expect(roleColour("nonsense", "regular", "member", "light")).toBe("#C4362E");
    expect(roleColour({ admin: { light: "red", dark: 12 } }, "admin", null, "light")).toBe("#8A5A00");
    expect(roleColour({ admin: { light: "red", dark: 12 } }, "admin", null, "dark")).toBe("#F5C04A");
    expect(roleColour({ admin: "gold" }, "admin", null, "light")).toBe("#8A5A00");
    expect(normaliseRoleColours({ member: { light: "#123456" } }).member).toEqual({ light: "#123456", dark: "#FFB8B3" });
    expect(normaliseRoleColours([])).toEqual(DEFAULT_ROLE_COLOURS);
  });
});

describe("role tags", () => {
  it("comes from the role, then the membership", () => {
    expect(roleTag("admin", "member")).toBe("Admin");
    expect(roleTag("committee", "non_member")).toBe("Committee");
    expect(roleTag("regular", "member")).toBe("Member");
    expect(roleTag("regular", "non_member")).toBeNull();
    expect(roleTag(null, null)).toBeNull();
  });
});

describe("nicknames", () => {
  it("are trimmed", () => {
    expect(validateNickname("  Bea  ")).toEqual({ ok: true, nickname: "Bea" });
  });

  it("need 1 to 30 characters", () => {
    expect(validateNickname("   ")).toEqual({ ok: false, error: "Choose a nickname." });
    expect(validateNickname(null)).toEqual({ ok: false, error: "Choose a nickname." });
    expect(validateNickname("x".repeat(30))).toEqual({ ok: true, nickname: "x".repeat(30) });
    expect(validateNickname("x".repeat(31))).toEqual({ ok: false, error: "Nicknames can be up to 30 characters." });
    // Counted like the database counts them (an emoji is one character).
    expect(validateNickname("😀".repeat(30)).ok).toBe(true);
  });

  it("can't contain control or hidden characters", () => {
    expect(validateNickname("Ca\u0007s").ok).toBe(false);
    expect(validateNickname("Ca​s").ok).toBe(false);
    expect(validateNickname("Ca‮s").ok).toBe(false);
    expect(validateNickname("Ca\nss").ok).toBe(false);
  });

  it("can't hide characters that look like nothing", () => {
    // Soft hyphen, a direction isolate, an Arabic letter mark, the Hangul and Braille blanks.
    for (const name of ["Sam\u00AD", "Sam\u2066", "Sam\u061C", "\u3164", "\uFFA0", "\u2800", "Sa\u034Fm"]) {
      expect(validateNickname(name)).toEqual({ ok: false, error: "Nicknames can't contain hidden or control characters." });
    }
  });

  it("are tidied: styled letters become plain ones, Unicode spaces are trimmed", () => {
    expect(validateNickname("\u00A0Bea\u3000")).toEqual({ ok: true, nickname: "Bea" });
    expect(validateNickname("Ｂｅａ")).toEqual({ ok: true, nickname: "Bea" });
    // An emoji keeps its picture, without the style selector a phone adds.
    expect(validateNickname("❤\uFE0F Sam")).toEqual({ ok: true, nickname: "❤ Sam" });
    expect(validateNickname("\uFE0F")).toEqual({ ok: false, error: "Choose a nickname." });
  });

  it("can't be (or pass for) a role or Function", () => {
    for (const name of ["Admin", "ADMIN", " a.d.m.i.n ", "Committee!", "Member 1", "mod-erator", "Function", "func tion", "Function Team", "FUNCTION_official", "Admins", "The Committee", "Committee Member", "Mod"]) {
      expect(validateNickname(name)).toEqual({ ok: false, error: "That nickname is reserved. Choose another." });
    }
  });

  it("can't pass for one with look-alike or fullwidth letters", () => {
    // A Cyrillic A, a Ukrainian i, a Cyrillic o, a Greek A, fullwidth ADMIN.
    for (const name of ["\u0410dmin", "Adm\u0456n", "C\u043Emmittee", "\u0391dmin", "ＡＤＭＩＮ", "Ｆｕｎｃｔｉｏｎ Team"]) {
      expect(validateNickname(name)).toEqual({ ok: false, error: "That nickname is reserved. Choose another." });
    }
  });

  it("compares look-alikes as the same nickname", () => {
    // "Sammy" with a Cyrillic S.
    expect(nicknameKey("\u0405ammy")).toBe(nicknameKey("Sammy"));
    expect(nicknameKey("SAMMY")).toBe("sammy");
    expect(nicknameKey("Zoë")).not.toBe(nicknameKey("Zoe"));
  });

  it("allows ordinary names that only contain a reserved word", () => {
    for (const name of ["Admiral", "Membership Sam", "Functional Fred", "Rhys", "Zoë", "李雷", "Иван", "Modric"]) expect(validateNickname(name).ok).toBe(true);
  });
});

describe("community chats in the chat helpers", () => {
  const DM = "44444444-4444-4444-8444-444444444444";
  const EVENT_CHAT = "55555555-5555-4555-8555-555555555555";
  const COMMUNITY_CHAT = "66666666-6666-4666-8666-666666666666";
  const EVENT = "77777777-7777-4777-8777-777777777777";
  const GROUP = "88888888-8888-4888-8888-888888888888";
  const BEA = "99999999-9999-4999-8999-999999999999";
  const thread = (id: string, extra: object) => ({ id, event_id: null, social_event_id: null, title: id, other_id: null, other_name: null, other_avatar: null, last_body: null, last_at: "2026-11-08T12:00:00Z", last_sender: null, unread: 0, ...extra });
  const rows = [
    { id: DM, event_id: null, social_event_id: null, community_group_id: null, user_a: SAM, user_b: BEA, members_can_share_events: true },
    { id: EVENT_CHAT, event_id: EVENT, social_event_id: null, community_group_id: null, user_a: null, user_b: null, members_can_share_events: true },
    { id: COMMUNITY_CHAT, event_id: null, social_event_id: null, community_group_id: GROUP, user_a: null, user_b: null, members_can_share_events: false },
  ];

  it("lists a community chat as a group chat, not allowed when its admins switched sharing off", async () => {
    const { client, queries } = fakeClient((name) => {
      if (name === "rpc:my_threads") return { data: [thread(DM, { other_id: BEA, other_avatar: "b.jpg" }), thread(EVENT_CHAT, { event_id: EVENT }), thread(COMMUNITY_CHAT, {})], error: null };
      if (name === "threads") return { data: rows, error: null };
      if (name === "rpc:is_thread_admin") return { data: false, error: null };
      return { data: null, error: null };
    });
    expect((await loadShareTargets(client)).map((t) => [t.id, t.isGroup, t.allowed])).toEqual([
      [DM, false, true],
      [EVENT_CHAT, true, true],
      [COMMUNITY_CHAT, true, false],
    ]);
    // Only the chat with sharing off asks whether you run it.
    expect(queries.filter((q) => q.name === "rpc:is_thread_admin").map((q) => q.calls[0])).toEqual([`args(${JSON.stringify({ tid: COMMUNITY_CHAT })})`]);
  });

  it("lets a community chat's admins share even when sharing is off", async () => {
    const { client } = fakeClient((name) => {
      if (name === "rpc:my_threads") return { data: [thread(COMMUNITY_CHAT, {})], error: null };
      if (name === "threads") return { data: rows.slice(2), error: null };
      if (name === "rpc:is_thread_admin") return { data: true, error: null };
      return { data: null, error: null };
    });
    expect((await loadShareTargets(client)).map((t) => [t.isGroup, t.allowed])).toEqual([[true, true]]);
  });

  it("treats a community chat as a group chat with no other person, where only its admins pin", async () => {
    const info = (admin: boolean) =>
      fakeClient((name) => {
        if (name === "threads") return { data: rows[2], error: null };
        if (name === "rpc:is_thread_admin") return { data: admin, error: null };
        return { data: null, error: null };
      });
    const regular = info(false);
    const asRegular = await loadThreadInfo(regular.client, COMMUNITY_CHAT, SAM);
    expect(asRegular).toMatchObject({ isGroup: true, other: null, isAdmin: false, canPin: false, membersCanShare: false });
    // Nobody's profile card is looked up: there's no "other person".
    expect(regular.queries.some((q) => q.name === "profile_cards")).toBe(false);
    expect(await loadThreadInfo(info(true).client, COMMUNITY_CHAT, SAM)).toMatchObject({ isGroup: true, isAdmin: true, canPin: true });
  });

  it("says how to leave a community's main chat", async () => {
    const main = fakeClient(() => ({ data: null, error: { message: "To leave this chat, leave the community instead" } }));
    expect(await leaveChat(main.client, COMMUNITY_CHAT)).toEqual({ error: "To leave this chat, leave the community instead." });
    const broken = fakeClient(() => ({ data: null, error: { message: "permission denied" } }));
    expect(await leaveChat(broken.client, COMMUNITY_CHAT)).toEqual({ error: "Couldn't leave the group. Try again." });
  });

  it("leaves private chats as they were", async () => {
    const { client } = fakeClient((name) => {
      if (name === "threads") return { data: rows[0], error: null };
      if (name === "profile_cards") return { data: [{ id: BEA, name: "Bea", avatar_url: null }], error: null };
      return { data: null, error: null };
    });
    expect(await loadThreadInfo(client, DM, SAM)).toMatchObject({ isGroup: false, other: { id: BEA, name: "Bea" }, canPin: true, isAdmin: false });
  });
});

describe("the join link", () => {
  it("is the community's /c/<slug>/join page", () => {
    expect(joinUrl("ucl-abacus")).toBe("https://studentfunction.com/c/ucl-abacus/join");
    expect(joinUrl("ucl-abacus", null, "https://app.studentfunction.com/")).toBe("https://app.studentfunction.com/c/ucl-abacus/join");
  });

  it("records who shared it", () => {
    expect(joinUrl("ucl-abacus", SAM)).toBe(`https://studentfunction.com/c/ucl-abacus/join?ref=${SAM}`);
    expect(joinUrl("ucl-abacus", SAM.toUpperCase())).toBe(`https://studentfunction.com/c/ucl-abacus/join?ref=${SAM}`);
    expect(joinUrl("ucl-abacus", "not-an-id")).toBe("https://studentfunction.com/c/ucl-abacus/join");
  });
});

describe("mutes", () => {
  const now = new Date("2026-11-08T18:00:00Z");
  it("last 1 hour, 8 hours, 1 week, or until switched off", () => {
    expect(muteUntil("1h", now)).toEqual(new Date("2026-11-08T19:00:00Z"));
    expect(muteUntil("8h", now)).toEqual(new Date("2026-11-09T02:00:00Z"));
    expect(muteUntil("1w", now)).toEqual(new Date("2026-11-15T18:00:00Z"));
    expect(muteUntil("always", now)).toBe("always");
    expect(muteUntil("off", now)).toBeNull();
  });

  it("are over once their time has passed", () => {
    expect(isMutedNow({ muted: true, muted_until: null }, now)).toBe(true);
    expect(isMutedNow({ muted: true, muted_until: "2026-11-08T19:00:00Z" }, now)).toBe(true);
    expect(isMutedNow({ muted: true, muted_until: "2026-11-08T17:00:00Z" }, now)).toBe(false);
    expect(isMutedNow({ muted: false, muted_until: null }, now)).toBe(false);
  });

  it("are set through the database", async () => {
    const { client, queries } = fakeClient(() => ({ data: null, error: null }));
    expect(await setThreadMute(client, THREAD, "8h")).toEqual({});
    expect(queries[0]).toEqual({ name: "rpc:set_thread_mute", calls: [`args(${JSON.stringify({ tid: THREAD, duration: "8h" })})`] });
    expect(await setThreadMute(client, "nope", "8h")).toEqual({ error: "Chat not found." });
    expect(queries).toHaveLength(1);
  });
});

describe("asking to join", () => {
  it("checks the nickname before asking the database", async () => {
    const { client, queries } = fakeClient(() => ({ data: "pending", error: null }));
    expect(await requestToJoinCommunity(client, "ucl-abacus", { nickname: "Admin", claimsMembership: false })).toEqual({ error: "That nickname is reserved. Choose another." });
    expect(queries).toHaveLength(0);
  });

  it("sends the tidied nickname, the claim and a valid ref", async () => {
    const { client, queries } = fakeClient(() => ({ data: "pending", error: null }));
    expect(await requestToJoinCommunity(client, "ucl-abacus", { nickname: " Bea ", claimsMembership: true, ref: SAM })).toEqual({ status: "pending" });
    expect(queries[0].name).toBe("rpc:request_to_join");
    expect(queries[0].calls[0]).toBe(`args(${JSON.stringify({ community_slug: "ucl-abacus", wanted_nickname: "Bea", claims_membership: true, ref: SAM })})`);
    await requestToJoinCommunity(client, "ucl-abacus", { nickname: "Bea", claimsMembership: false, ref: "junk" });
    expect(queries[1].calls[0]).toContain('"ref":null');
  });

  it("passes on the database's own message, but never a technical one", async () => {
    const taken = fakeClient(() => ({ data: null, error: { message: "That nickname is taken in this community. Try another" } }));
    expect(await requestToJoinCommunity(taken.client, "ucl-abacus", { nickname: "Bea", claimsMembership: false })).toEqual({ error: "That nickname is taken in this community. Try another." });
    const broken = fakeClient(() => ({ data: null, error: { message: "permission denied for function request_to_join" } }));
    expect(await requestToJoinCommunity(broken.client, "ucl-abacus", { nickname: "Bea", claimsMembership: false })).toEqual({ error: "Couldn't send your request. Try again." });
    const active = fakeClient(() => ({ data: "active", error: null }));
    expect(await requestToJoinCommunity(active.client, "ucl-abacus", { nickname: "Bea", claimsMembership: false })).toEqual({ status: "active" });
  });
});

describe("community notes", () => {
  it("show as notes, not bubbles", () => {
    expect(isNote("joined")).toBe(true);
    expect(isNote("added")).toBe(true);
    expect(isNote("message")).toBe(false);
  });
});

const row = (n: number, at = `2026-11-08T18:00:${String(n % 60).padStart(2, "0")}.000000+00:00`) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  thread_id: THREAD,
  sender_id: SAM,
  body: `m${n}`,
  kind: "message",
  created_at: at,
  deleted_at: null,
});

describe("paging through a chat", () => {
  it("asks for the newest 50, newest first, by time then id", async () => {
    const { client, queries } = fakeClient((name) => (name === "profile_cards" ? { data: [{ id: SAM, name: "Sam", avatar_url: null }], error: null } : { data: [row(2), row(1)], error: null }));
    const page = await fetchMessagesPage(client, THREAD);
    expect(queries[0]).toEqual({ name: "messages", calls: ['select("*")', `eq("thread_id","${THREAD}")`, 'order("created_at",{"ascending":false})', 'order("id",{"ascending":false})', "limit(50)"] });
    expect(page.messages.map((m) => m.body)).toEqual(["m2", "m1"]);
    expect(page.messages[0].sender_name).toBe("Sam");
    expect(page.older).toBeNull();
  });

  it("asks for the page before a message by its time and id", async () => {
    const { client, queries } = fakeClient(() => ({ data: [], error: null }));
    const before = { created_at: "2026-11-08T18:00:05.123456+00:00", id: MSG };
    await fetchMessagesPage(client, THREAD, { before, limit: 20 });
    expect(queries[0].calls).toEqual([
      'select("*")',
      `eq("thread_id","${THREAD}")`,
      `lte("created_at","${before.created_at}")`,
      `or("created_at.lt.\\"${before.created_at}\\",id.lt.${MSG}")`,
      'order("created_at",{"ascending":false})',
      'order("id",{"ascending":false})',
      "limit(20)",
    ]);
  });

  it("says where the next page starts when the page was full", async () => {
    const rows = [row(3), row(2)];
    const { client } = fakeClient((name) => (name === "messages" ? { data: rows, error: null } : { data: [], error: null }));
    const page = await fetchMessagesPage(client, THREAD, { limit: 2 });
    expect(page.older).toEqual({ created_at: rows[1].created_at, id: rows[1].id });
  });

  it("never builds a filter from a bad id or time", async () => {
    const { client, queries } = fakeClient(() => ({ data: [], error: null }));
    expect(await fetchMessagesPage(client, "x")).toEqual({ messages: [], older: null });
    expect(await fetchMessagesPage(client, THREAD, { before: { created_at: "2026),id.gt.(0", id: MSG } })).toEqual({ messages: [], older: null });
    expect(await fetchMessagesPage(client, THREAD, { before: { created_at: "2026-11-08T18:00:00Z", id: "1,or" } })).toEqual({ messages: [], older: null });
    expect(queries).toHaveLength(0);
  });

  it("keeps pages between 1 and 100", async () => {
    const { client, queries } = fakeClient(() => ({ data: [], error: null }));
    await fetchMessagesPage(client, THREAD, { limit: 5000 });
    await fetchMessagesPage(client, THREAD, { limit: 0 });
    expect(queries[0].calls).toContain("limit(100)");
    expect(queries[1].calls).toContain("limit(1)");
  });

  it("throws when the database fails", async () => {
    const { client } = fakeClient(() => ({ data: null, error: { message: "boom" } }));
    await expect(fetchMessagesPage(client, THREAD)).rejects.toBeTruthy();
  });
});

describe("catching up", () => {
  const after = { created_at: "2026-11-08T18:00:10.000000+00:00", id: MSG };

  it("starts a little early, then pages oldest first until a short page", async () => {
    const pages = [Array.from({ length: 3 }, (_, i) => row(11 + i)), [row(14)]];
    const { client, queries } = fakeClient((name) => (name === "messages" ? { data: pages.shift() ?? [], error: null } : { data: [], error: null }));
    const result = await fetchMessagesAfter(client, THREAD, after, { pageSize: 3 });
    expect(result.complete).toBe(true);
    expect(result.messages.map((m) => m.body)).toEqual(["m11", "m12", "m13", "m14"]);
    const messageQueries = queries.filter((q) => q.name === "messages");
    expect(messageQueries).toHaveLength(2);
    expect(messageQueries[0].calls).toEqual([
      'select("*")',
      `eq("thread_id","${THREAD}")`,
      'gte("created_at","2026-11-08T18:00:05.000Z")',
      'order("created_at",{"ascending":true})',
      'order("id",{"ascending":true})',
      "limit(3)",
    ]);
    const last = row(13);
    expect(messageQueries[1].calls).toContain(`gte("created_at","${last.created_at}")`);
    expect(messageQueries[1].calls).toContain(`or("created_at.gt.\\"${last.created_at}\\",id.gt.${last.id}")`);
  });

  it("never skips a burst of more than 100: it keeps paging", async () => {
    let served = 0;
    const { client, queries } = fakeClient((name) => {
      if (name !== "messages") return { data: [], error: null };
      const count = served < 250 ? Math.min(100, 250 - served) : 0;
      const data = Array.from({ length: count }, (_, i) => row(served + i + 1));
      served += count;
      return { data, error: null };
    });
    const result = await fetchMessagesAfter(client, THREAD, after);
    expect(result.messages).toHaveLength(250);
    expect(result.complete).toBe(true);
    expect(queries.filter((q) => q.name === "messages")).toHaveLength(3);
  });

  it("stops at maxPages and says so", async () => {
    const { client } = fakeClient((name) => (name === "messages" ? { data: Array.from({ length: 2 }, (_, i) => row(i + 1)), error: null } : { data: [], error: null }));
    const result = await fetchMessagesAfter(client, THREAD, after, { pageSize: 2, maxPages: 2 });
    expect(result).toMatchObject({ complete: false });
    expect(result.messages).toHaveLength(4);
  });
});

describe("send-push batching", () => {
  const rows: QueueRow[] = [1, 2, 3].map((id) => ({ id, user_id: `u${id}`, kind: "messages", title: "T", body: `B${id}`, url: "/chats/x" }));
  const tokens: TokenRow[] = [
    { id: "a", user_id: "u1", platform: "ios", token: "ExponentPushToken[a]", subscription: null },
    { id: "b", user_id: "u1", platform: "android", token: "ExponentPushToken[b]", subscription: null },
    { id: "c", user_id: "u2", platform: "web", token: "https://push.example/c", subscription: { endpoint: "x" } },
  ];

  it("splits into requests of up to 100", () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    expect(chunk(items, 100).map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunk([], 100)).toEqual([]);
  });

  it("sends several requests at once, but no more than the limit", async () => {
    let running = 0;
    let most = 0;
    const out = await mapLimit(Array.from({ length: 20 }, (_, i) => i), 6, async (n) => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return n * 2;
    });
    expect(most).toBe(6);
    expect(out).toEqual(Array.from({ length: 20 }, (_, i) => i * 2));
  });

  it("makes one Expo message per phone and one Web Push job per browser", () => {
    const plan = planDeliveries(rows, tokens);
    expect(plan.expo.map((j) => [j.rowId, j.message.to])).toEqual([[1, "ExponentPushToken[a]"], [1, "ExponentPushToken[b]"]]);
    expect(plan.expo[0].message).toMatchObject({ title: "T", body: "B1", data: { url: "/chats/x" }, priority: "high" });
    expect(plan.web.map((j) => [j.row.id, j.token.id])).toEqual([[2, "c"]]);
  });

  it("reads Expo's tickets: dead phones are forgotten, a busy Expo is retried", () => {
    const plan = planDeliveries(rows, tokens).expo;
    const answer = readExpoAnswer(plan, 200, { data: [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }] });
    expect(answer.deliveries).toEqual([{ rowId: 1, outcome: "ok" }, { rowId: 1, outcome: "dead" }]);
    expect(answer.dead).toEqual(["ExponentPushToken[b]"]);
    expect(readExpoAnswer(plan, 200, { data: [{ status: "error", details: { error: "MessageRateExceeded" } }, { status: "error", details: { error: "MessageTooBig" } }] }).deliveries.map((d) => d.outcome)).toEqual(["retry", "failed"]);
  });

  it("retries a whole request that failed", () => {
    const plan = planDeliveries(rows, tokens).expo;
    for (const [status, body] of [[503, { errors: [{ message: "down" }] }], [0, null], [200, {}]] as const) {
      const answer = readExpoAnswer(plan, status, body);
      expect(answer.deliveries.every((d) => d.outcome === "retry")).toBe(true);
      expect(answer.errors[0]).toMatch(/^expo /);
    }
  });

  it("sends a request again while Expo says too many at once (429)", async () => {
    const plan = planDeliveries(rows, tokens).expo;
    const tickets = { data: [{ status: "ok" }, { status: "ok" }] };
    const fakeExpo = (statuses: number[]) => {
      let sends = 0;
      const waits: number[] = [];
      const post = async () => {
        const status = statuses[Math.min(sends, statuses.length - 1)];
        sends++;
        return { status, answer: status === 200 ? tickets : { errors: [{ message: "busy" }] } };
      };
      return { post, sleep: async (ms: number) => void waits.push(ms), sends: () => sends, waits };
    };

    const busyTwice = fakeExpo([429, 429, 200]);
    const ok = await sendExpoRequest(busyTwice.post, busyTwice.sleep);
    expect(busyTwice.sends()).toBe(3);
    expect(busyTwice.waits).toEqual([1000, 2000]);
    expect(readExpoAnswer(plan, ok.status, ok.answer).deliveries.map((d) => d.outcome)).toEqual(["ok", "ok"]);

    const alwaysBusy = fakeExpo([429]);
    const busy = await sendExpoRequest(alwaysBusy.post, alwaysBusy.sleep);
    expect(alwaysBusy.sends()).toBe(3);
    expect(readExpoAnswer(plan, busy.status, busy.answer).deliveries.map((d) => d.outcome)).toEqual(["retry", "retry"]);

    const down = fakeExpo([503, 200]);
    const failed = await sendExpoRequest(down.post, down.sleep);
    expect(down.sends()).toBe(1);
    expect(down.waits).toEqual([]);
    expect(readExpoAnswer(plan, failed.status, failed.answer).deliveries.map((d) => d.outcome)).toEqual(["retry", "retry"]);
  });

  it("reads Web Push errors", () => {
    expect(webOutcome(null)).toBe("ok");
    expect(webOutcome({ statusCode: 410 })).toBe("dead");
    expect(webOutcome({ statusCode: 404 })).toBe("dead");
    expect(webOutcome({ statusCode: 503 })).toBe("retry");
    expect(webOutcome(new Error("network"))).toBe("retry");
    expect(webOutcome({ statusCode: 400 })).toBe("failed");
  });

  it("retries a notification only when none of it got through", () => {
    expect(settle([1, 2, 3, 4], [
      { rowId: 1, outcome: "ok" },
      { rowId: 1, outcome: "retry" },
      { rowId: 2, outcome: "retry" },
      { rowId: 3, outcome: "dead" },
    ])).toEqual({ sent: [1, 3, 4], retry: [2] });
  });
});
