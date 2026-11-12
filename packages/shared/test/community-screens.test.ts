import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { asChatListItem, isGroupChat, loadChatsTab, type Thread } from "../src/chats";
import {
  communityJoinPath,
  communityManagePath,
  communityMemberClaims,
  communityPath,
  communitySlugFrom,
  communityTabs,
  communityView,
  defaultJoinNickname,
  filterByNickname,
  isCommunityManager,
  isCommunitySlug,
  joinRef,
  memberActions,
  membershipClaimBadge,
  membershipClaimLabel,
  rosterCounts,
  unreadLabel,
  validateNickname,
} from "../src/communities";

// The community screens (part 2 of docs/COMMUNITIES_PLAN.md): which state
// and tabs a page shows, the join screen's wording and nickname, who may do
// what in Manage, the Chats tab's rows, and the claims list.

const repo = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repo), "utf8");
const ME = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";
const CID = "55555555-5555-4555-8555-555555555555";

type Res = { data: unknown; error: { code?: string; message?: string } | null; count?: number };
// A Supabase client that answers each RPC or table read with `answer(name)`.
function fakeClient(answer: (name: string, args?: unknown) => Res) {
  const calls: string[] = [];
  const thenable = (name: string, args?: unknown) => {
    const q: object = new Proxy(
      {},
      { get: (_t, prop) => (prop === "then" ? (ok: (r: Res) => unknown) => Promise.resolve(answer(name, args)).then(ok) : () => q) },
    );
    return q;
  };
  const client = {
    rpc: (fn: string, args: unknown) => {
      calls.push(`rpc:${fn}:${JSON.stringify(args)}`);
      return thenable(`rpc:${fn}`, args);
    },
    from: (table: string) => {
      calls.push(`from:${table}`);
      return thenable(table);
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("where you stand with a community", () => {
  it("is your status, or none if you never asked", () => {
    expect(communityView(null)).toBe("none");
    expect(communityView(undefined)).toBe("none");
    for (const status of ["pending", "active", "declined", "left", "removed"] as const) expect(communityView({ status })).toBe(status);
  });

  it("only active admins and committee manage", () => {
    expect(isCommunityManager({ status: "active", role: "admin" })).toBe(true);
    expect(isCommunityManager({ status: "active", role: "committee" })).toBe(true);
    expect(isCommunityManager({ status: "active", role: "regular" })).toBe(false);
    // Someone who left or was removed keeps no powers, whatever their old role.
    expect(isCommunityManager({ status: "left", role: "admin" })).toBe(false);
    expect(isCommunityManager({ status: "pending", role: "committee" })).toBe(false);
    expect(isCommunityManager(null)).toBe(false);
  });

  it("shows Manage to admins, committee and the Function team only", () => {
    expect(communityTabs({ me: { status: "active", role: "regular" }, is_function_admin: false })).toEqual(["chat", "groups", "tickets"]);
    expect(communityTabs({ me: { status: "active", role: "committee" }, is_function_admin: false })).toEqual(["chat", "groups", "tickets", "manage"]);
    expect(communityTabs({ me: { status: "active", role: "admin" }, is_function_admin: false })).toContain("manage");
    expect(communityTabs({ me: null, is_function_admin: true })).toContain("manage");
    expect(communityTabs({ me: { status: "removed", role: "admin" }, is_function_admin: false })).not.toContain("manage");
  });
});

describe("the join screen", () => {
  it("asks in the community's own words", () => {
    expect(membershipClaimLabel("UCL Abacus")).toBe("I'm a paying member of UCL Abacus");
    expect(membershipClaimLabel("UCL Abacus", "paying member")).toBe("I'm a paying member of UCL Abacus");
    expect(membershipClaimLabel("UCL Abacus", "  ")).toBe("I'm a paying member of UCL Abacus");
    expect(membershipClaimLabel("Chess Club", "associate member")).toBe("I'm an associate member of Chess Club");
    expect(membershipClaimLabel("Chess Club", "season ticket holder")).toBe("I'm a season ticket holder of Chess Club");
    expect(membershipClaimBadge(null)).toBe("Says they're a paying member");
    expect(membershipClaimBadge("associate member")).toBe("Says they're an associate member");
  });

  it("starts with your profile nickname, else your first name", () => {
    expect(defaultJoinNickname({ nickname: " Rhysy ", full_name: "Rhys Hetherton" })).toBe("Rhysy");
    expect(defaultJoinNickname({ nickname: "", full_name: "Rhys Hetherton" })).toBe("Rhys");
    expect(defaultJoinNickname({ nickname: null, full_name: null, display_name: "Sam Student" })).toBe("Sam");
    expect(defaultJoinNickname(null)).toBe("");
    expect([...defaultJoinNickname({ nickname: "x".repeat(40) })]).toHaveLength(30);
    // Whatever it starts with still goes through the nickname rules.
    expect(validateNickname(defaultJoinNickname({ nickname: "Admin" })).ok).toBe(false);
  });

  it("keeps only a real user id from ?ref=", () => {
    expect(joinRef(ME)).toBe(ME);
    expect(joinRef(ME.toUpperCase())).toBe(ME);
    expect(joinRef([ME, OTHER])).toBe(ME);
    expect(joinRef("not-an-id")).toBeNull();
    expect(joinRef(undefined)).toBeNull();
    expect(joinRef("'; drop table x; --")).toBeNull();
  });

  it("has the community's paths", () => {
    expect(communityPath("ucl-abacus")).toBe("/c/ucl-abacus");
    expect(communityJoinPath("ucl-abacus")).toBe("/c/ucl-abacus/join");
    expect(communityManagePath("ucl-abacus")).toBe("/c/ucl-abacus/manage");
  });
});

describe("unread badges", () => {
  it("stop at 99+ for community chats (their count stops at 99)", () => {
    expect(unreadLabel(0)).toBe("0");
    expect(unreadLabel(7)).toBe("7");
    expect(unreadLabel(99)).toBe("99");
    expect(unreadLabel(99, true)).toBe("99+");
    expect(unreadLabel(98, true)).toBe("98");
    expect(unreadLabel(150)).toBe("99+");
    expect(unreadLabel(Number.NaN)).toBe("0");
  });
});

describe("Manage", () => {
  const roster = [
    { user_id: ME, nickname: "Sam", role: "admin" as const, membership: "member" as const, avatar_url: null },
    { user_id: OTHER, nickname: "Béa", role: "committee" as const, membership: "non_member" as const, avatar_url: null },
    { user_id: "a", nickname: "Cas", role: "regular" as const, membership: "member" as const, avatar_url: null },
    { user_id: "b", nickname: "Dee", role: "regular" as const, membership: "non_member" as const, avatar_url: null },
  ];

  it("counts people, paying members, committee and admins", () => {
    expect(rosterCounts(roster)).toEqual({ members: 4, paying: 2, committee: 1, admins: 1 });
    expect(rosterCounts([])).toEqual({ members: 0, paying: 0, committee: 0, admins: 0 });
  });

  it("searches by nickname, ignoring case and accents", () => {
    expect(filterByNickname(roster, "bea").map((r) => r.nickname)).toEqual(["Béa"]);
    expect(filterByNickname(roster, "  ").length).toBe(4);
    expect(filterByNickname(roster, "zz")).toEqual([]);
  });

  it("admins change roles and membership and remove anyone, never themselves", () => {
    const admin = { userId: ME, role: "admin" as const, isFunctionAdmin: false };
    expect(memberActions(admin, roster[1], 1)).toEqual({ changeRole: true, changeMembership: true, remove: true, lastAdmin: false });
    expect(memberActions(admin, roster[0], 1)).toEqual({ changeRole: false, changeMembership: false, remove: false, lastAdmin: true });
  });

  it("committee only remove regular people", () => {
    const committee = { userId: OTHER, role: "committee" as const, isFunctionAdmin: false };
    expect(memberActions(committee, roster[2], 1)).toEqual({ changeRole: false, changeMembership: false, remove: true, lastAdmin: false });
    expect(memberActions(committee, roster[0], 1).remove).toBe(false);
    expect(memberActions(committee, { user_id: "c", role: "committee" }, 1).remove).toBe(false);
  });

  it("regular people do nothing", () => {
    const regular = { userId: "a", role: "regular" as const, isFunctionAdmin: false };
    expect(memberActions(regular, roster[3], 1)).toEqual({ changeRole: false, changeMembership: false, remove: false, lastAdmin: false });
  });

  it("the Function team can do everything, and sees who's the last admin", () => {
    const team = { userId: "z", role: null, isFunctionAdmin: true };
    expect(memberActions(team, roster[0], 1)).toEqual({ changeRole: true, changeMembership: true, remove: true, lastAdmin: true });
    expect(memberActions(team, roster[0], 2).lastAdmin).toBe(false);
  });

  it("reads the paying-member claims (admins only, in the database)", async () => {
    const { client, calls } = fakeClient(() => ({ data: [{ user_id: ME }, { user_id: OTHER }], error: null }));
    expect([...(await communityMemberClaims(client, CID))]).toEqual([ME, OTHER]);
    expect(calls).toEqual([`rpc:community_member_claims:{"cid":"${CID}"}`]);
    expect((await communityMemberClaims(client, "nope")).size).toBe(0);
    expect(calls).toHaveLength(1);
    const failing = fakeClient(() => ({ data: null, error: { message: "boom" } }));
    await expect(communityMemberClaims(failing.client, CID)).rejects.toBeTruthy();
  });
});

describe("a new community's web address", () => {
  it("comes from its name", () => {
    expect(communitySlugFrom("UCL Abacus")).toBe("ucl-abacus");
    expect(communitySlugFrom("  King's Café & Chess  ")).toBe("kings-cafe-and-chess");
    expect(communitySlugFrom("---")).toBe("");
    expect(communitySlugFrom("x".repeat(70)).length).toBe(60);
    expect(communitySlugFrom(`${"a".repeat(59)} b`)).toBe("a".repeat(59));
    for (const name of ["UCL Abacus", "LSE Poker Society", "Imperial  Rowing!!"]) expect(isCommunitySlug(communitySlugFrom(name))).toBe(true);
  });
});

describe("the Chats tab", () => {
  const thread = (over: Partial<Thread>): Thread => ({ id: "t", event_id: null, social_event_id: null, title: "T", other_id: null, other_name: null, other_avatar: null, last_body: null, last_at: "2026-11-03T12:00:00Z", last_sender: null, unread: 0, ...over });

  it("files community, event and Social chats under Events & Societies, the rest under Personal", () => {
    expect(isGroupChat({ kind: "community", event_id: null, social_event_id: null })).toBe(true);
    expect(isGroupChat({ kind: "event", event_id: "e", social_event_id: null })).toBe(true);
    expect(isGroupChat({ kind: "social", event_id: null, social_event_id: "s" })).toBe(true);
    expect(isGroupChat({ kind: "direct", event_id: null, social_event_id: null })).toBe(false);
    // An older row without a kind still works from its event.
    expect(isGroupChat({ event_id: "e", social_event_id: null })).toBe(true);
    expect(isGroupChat({ event_id: null, social_event_id: null })).toBe(false);
  });

  it("uses the fuller list, with the friend requests", async () => {
    const { client, calls } = fakeClient((name) =>
      name === "rpc:my_chat_list"
        ? { data: [{ ...thread({ id: "c1", unread: "120" as unknown as number }), kind: "community", community_slug: "ucl-abacus", muted: true }], error: null }
        : { data: null, error: null, count: 2 },
    );
    const tab = await loadChatsTab(client, ME);
    expect(tab.requests).toBe(2);
    expect(tab.threads[0]).toMatchObject({ id: "c1", kind: "community", unread: 120, muted: true });
    expect(calls.some((c) => c.startsWith("rpc:my_threads"))).toBe(false);
  });

  it("falls back to the older list before the communities migration has run", async () => {
    const { client, calls } = fakeClient((name) =>
      name === "rpc:my_chat_list"
        ? { data: null, error: { code: "PGRST202", message: "Could not find the function public.my_chat_list" } }
        : name === "rpc:my_threads"
          ? { data: [thread({ id: "e1", event_id: "e", unread: 3 }), thread({ id: "d1" })], error: null }
          : { data: null, error: null, count: 1 },
    );
    const tab = await loadChatsTab(client, ME);
    expect(calls.some((c) => c.startsWith("rpc:my_threads"))).toBe(true);
    expect(tab.threads.map((t) => [t.id, t.kind, t.muted, t.community_id])).toEqual([["e1", "event", false, null], ["d1", "direct", false, null]]);
    expect(tab.requests).toBe(1);
  });

  it("an older row keeps everything it had", () => {
    const t = thread({ id: "s1", social_event_id: "s", unread: 4, last_body: "hi" });
    expect(asChatListItem(t)).toMatchObject({ ...t, kind: "social", muted: false, muted_until: null, community_slug: null });
  });
});

describe("community chat notifications open the chat", () => {
  it("the database sends community chats to /chats/<id>, which a tap opens", () => {
    const sql = read("supabase/migrations/20261202000000_communities.sql");
    const branch = sql.slice(sql.indexOf("if t.community_group_id is not null then\n    select g.kind"), sql.indexOf("if t.event_id is null and t.social_event_id is null then\n    other :="));
    expect(branch).toContain("'/chats/' || t.id");
    const push = read("apps/mobile/src/lib/push.ts");
    expect(push).toMatch(/url\.startsWith\("\/"\)\) router\.push\(url/);
    const sw = read("apps/mobile/public/sw.js");
    expect(sw).toContain("client.navigate(url)");
  });
});
