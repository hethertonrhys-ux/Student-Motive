import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { defaultFeatureKeys, FEATURES, type FeatureSubject } from "../src/features";
import {
  addManager,
  agreeToFounding,
  eventLink,
  featuresOnCount,
  FOUNDING_FUNCTION_COMMITS,
  FOUNDING_SOCIETY_COMMITS,
  FOUNDING_STAY_ACTIVE,
  HUB_STEP_LABELS,
  hubSteps,
  inviteManager,
  isHubStep,
  LAST_MANAGER_MESSAGE,
  leaveManagement,
  loadHubSociety,
  nextHubStep,
  pretickedFeatures,
  previousHubStep,
  societyLink,
  storyLines,
  whatsappShareUrl,
  whatsappText,
} from "../src/hub";
import { formatEventTime } from "../src/time";

// Any emoji or pictograph (the copy never uses them).
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;
const SITE = "https://studentfunction.com";

// A Supabase client that fails the test if it is used at all.
const untouchable = new Proxy({}, { get: () => { throw new Error("the server was called"); } }) as unknown as SupabaseClient;

// A Supabase client whose rpc() answers once and records the call.
function rpcClient(answer: { data?: unknown; error?: unknown }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = { rpc: (fn: string, args: unknown) => { calls.push({ fn, args }); return Promise.resolve({ data: null, error: null, ...answer }); } } as unknown as SupabaseClient;
  return { client, calls };
}

describe("the setup wizard's steps", () => {
  it("has eight steps for a Founding Society, in order", () => {
    expect(hubSteps({ isFounding: true })).toEqual(["welcome", "page", "type", "features", "founding", "committee", "event", "live"]);
  });

  it("leaves out the Founding step for every other society", () => {
    const steps = hubSteps({ isFounding: false });
    expect(steps).toEqual(["welcome", "page", "type", "features", "committee", "event", "live"]);
    expect(steps).toHaveLength(7);
  });

  it("knows its steps, and what comes before and after", () => {
    const steps = hubSteps({ isFounding: false });
    expect(nextHubStep(steps, "features")).toBe("committee");
    expect(previousHubStep(steps, "committee")).toBe("features");
    expect(nextHubStep(steps, "live")).toBeNull();
    expect(previousHubStep(steps, "welcome")).toBeNull();
    expect(nextHubStep(steps, "founding")).toBeNull();
    expect(isHubStep("founding")).toBe(true);
    expect(isHubStep("nope")).toBe(false);
    expect(isHubStep(undefined)).toBe(false);
    for (const s of hubSteps({ isFounding: true })) expect(HUB_STEP_LABELS[s].trim()).not.toBe("");
  });
});

describe("the Founding Society agreement", () => {
  it("is worded exactly as agreed", () => {
    expect(FOUNDING_FUNCTION_COMMITS).toEqual([
      "Building one feature around how you run within 24 hours of your request",
      "A Founding Society badge and an Instagram Collab post",
      "Entry into the prize draw for your next social",
      "Free for societies, always",
    ]);
    expect(FOUNDING_SOCIETY_COMMITS).toEqual([
      'Putting your next 3 events on Function, with "RSVP on Function" and the link in the caption and story',
      "Adding the Function link to your Instagram bio for launch week",
      "Posting a story and a Collab post on launch day",
    ]);
    expect(FOUNDING_STAY_ACTIVE).toBe("The badge, prize draw entry and 24-hour builds stay active while you keep posting events. Either side can stop at any time.");
    for (const line of [...FOUNDING_FUNCTION_COMMITS, ...FOUNDING_SOCIETY_COMMITS, FOUNDING_STAY_ACTIVE]) expect(line).not.toMatch(EMOJI);
  });
});

describe("links and sharing", () => {
  it("builds the society and event links with or without a trailing slash", () => {
    expect(societyLink(SITE, "lse-poker-society")).toBe("https://studentfunction.com/s/lse-poker-society");
    expect(societyLink(`${SITE}/`, "lse-poker-society")).toBe("https://studentfunction.com/s/lse-poker-society");
    expect(societyLink("http://localhost:8123//", "chess")).toBe("http://localhost:8123/s/chess");
    expect(eventLink(SITE, "abc")).toBe("https://studentfunction.com/e/abc");
    expect(eventLink(`${SITE}/`, "abc")).toBe("https://studentfunction.com/e/abc");
  });

  it("encodes the WhatsApp message", () => {
    expect(whatsappShareUrl("Poker night & drinks: https://x.com/e/1?a=b")).toBe("https://wa.me/?text=Poker%20night%20%26%20drinks%3A%20https%3A%2F%2Fx.com%2Fe%2F1%3Fa%3Db");
    expect(decodeURIComponent(whatsappShareUrl("Line one\nLine two £5").split("text=")[1])).toBe("Line one\nLine two £5");
  });

  it("writes the WhatsApp text with the event, or the society's page", () => {
    const event = { id: "e1", title: "Poker night", starts_at: "2026-11-03T19:00:00Z", ends_at: "2026-11-03T23:00:00Z" };
    const withEvent = whatsappText(event, { name: "LSE Poker Society", slug: "lse-poker-society" }, SITE);
    expect(withEvent).toContain("Poker night");
    expect(withEvent).toContain("RSVP on Function");
    expect(withEvent).toContain("https://studentfunction.com/e/e1");
    const without = whatsappText(null, { name: "LSE Poker Society", slug: "lse-poker-society" }, SITE);
    expect(without).toContain("https://studentfunction.com/s/lse-poker-society");
    expect(withEvent).not.toMatch(EMOJI);
    expect(without).not.toMatch(EMOJI);
  });
});

describe("the story card", () => {
  const society = { name: "LSE Poker Society", slug: "lse-poker-society" };
  const event = { id: "e1", title: "Freshers' poker night", starts_at: "2026-11-03T19:00:00Z", ends_at: "2026-11-03T23:00:00Z", place: "Saw Swee Hock Centre" };

  it("has the society, the event, its day and time, the place, RSVP on Function and the link", () => {
    expect(storyLines(event, society, SITE)).toEqual([
      { kind: "society", text: "LSE Poker Society" },
      { kind: "title", text: "Freshers' poker night" },
      { kind: "when", text: formatEventTime(event.starts_at, event.ends_at) },
      { kind: "place", text: "Saw Swee Hock Centre" },
      { kind: "cta", text: "RSVP on Function" },
      { kind: "link", text: "studentfunction.com/e/e1" },
    ]);
  });

  it("leaves out a missing place", () => {
    const lines = storyLines({ ...event, place: "  " }, society, SITE);
    expect(lines.map((l) => l.kind)).toEqual(["society", "title", "when", "cta", "link"]);
    expect(storyLines({ ...event, place: null }, society, SITE).some((l) => l.kind === "place")).toBe(false);
  });

  it("points to the society's page when there's no event yet", () => {
    const lines = storyLines(null, society, `${SITE}/`);
    expect(lines[0]).toEqual({ kind: "society", text: "LSE Poker Society" });
    expect(lines.find((l) => l.kind === "cta")?.text).toBe("RSVP on Function");
    expect(lines.at(-1)).toEqual({ kind: "link", text: "studentfunction.com/s/lse-poker-society" });
    for (const l of lines) expect(l.text).not.toMatch(EMOJI);
  });
});

describe("features in the Hub", () => {
  it("pre-ticks the type's defaults (and the uni's) for a society that hasn't chosen", () => {
    const games: FeatureSubject = { society_type: "games", university: "LSE", features: [] };
    const ticked = pretickedFeatures(games);
    const live = FEATURES.filter((f) => f.status === "live").map((f) => f.key);
    expect(Object.keys(ticked).sort()).toEqual([...live].sort());
    expect(Object.entries(ticked).filter(([, on]) => on).map(([k]) => k).sort()).toEqual(defaultFeatureKeys("games", "LSE").sort());
    expect(ticked.tables && ticked.ledger && ticked.event_admin).toBe(true);
    expect(pretickedFeatures({ society_type: "games", university: "UCL", features: [] }).event_admin).toBe(false);
  });

  it("pre-ticks everything from before for a society without a type, and never a coming-soon feature", () => {
    const legacy = pretickedFeatures({ society_type: null, university: "LSE", features: null });
    expect(legacy).toEqual({ signup_lists: true, tables: true, ledger: true, event_cost: true, member_invites: true, event_chats: true, event_admin: false });
  });

  it("counts the live features that are on", () => {
    expect(featuresOnCount({ society_type: null, university: "LSE" })).toBe(6);
    expect(featuresOnCount({ society_type: "games", university: "LSE", features: [{ feature_key: "event_cost", enabled: false }, { feature_key: "polls", enabled: true }] })).toBe(defaultFeatureKeys("games", "LSE").length - 1);
  });
});

describe("loading a society for the Hub", () => {
  it("treats a malformed id in the link as a society you don't manage, without asking the server", async () => {
    expect(await loadHubSociety(untouchable, "setup")).toBeNull();
    expect(await loadHubSociety(untouchable, "")).toBeNull();
  });
});

describe("managers", () => {
  it("refuses a malformed email without asking the server", async () => {
    for (const bad of ["", "  ", "bea", "bea@", "@lse.ac.uk", "bea@lse", "b ea@lse.ac.uk"]) {
      expect(await inviteManager(untouchable, "s1", bad)).toEqual({ error: "That doesn't look like an email address." });
    }
  });

  it("sends a tidied email and passes back added or invited", async () => {
    const { client, calls } = rpcClient({ data: "invited" });
    expect(await inviteManager(client, "s1", "  Bea@LSE.ac.uk ")).toEqual({ result: "invited" });
    expect(calls).toEqual([{ fn: "invite_society_manager", args: { sid: "s1", address: "bea@lse.ac.uk" } }]);
    expect(await inviteManager(rpcClient({ data: "added" }).client, "s1", "bea@lse.ac.uk")).toEqual({ result: "added" });
    expect((await inviteManager(rpcClient({ data: "something" }).client, "s1", "bea@lse.ac.uk")).error).toBeTruthy();
    expect((await inviteManager(rpcClient({ error: { message: "Only the society's managers can do this" } }).client, "s1", "bea@lse.ac.uk")).error).toBe("Couldn't add them. Try again.");
  });

  it("asks for a uni email when the address could never sign up", async () => {
    expect(await inviteManager(rpcClient({ error: { message: "Use their uni email: only uni students can sign up" } }).client, "s1", "bea@gmail.com")).toEqual({ error: "Use their uni email: only uni students can sign up." });
  });

  it("says when someone can't be added because of a block", async () => {
    const message = { error: { message: "You can't add this person" } };
    expect(await addManager(rpcClient(message).client, "s1", "p1")).toEqual({ error: "You can't add this person." });
    expect(await inviteManager(rpcClient(message).client, "s1", "bea@lse.ac.uk")).toEqual({ error: "You can't add this person." });
    expect(await addManager(rpcClient({ error: { message: "network" } }).client, "s1", "p1")).toEqual({ error: "Couldn't add them. Try again." });
    const { client, calls } = rpcClient({});
    expect(await addManager(client, "s1", "p1")).toEqual({});
    expect(calls).toEqual([{ fn: "add_society_manager", args: { sid: "s1", person: "p1" } }]);
  });

  it("explains why the last manager can't step down", async () => {
    expect(await leaveManagement(rpcClient({ error: { message: "You're the last manager. Add someone else first, then remove yourself." } }).client, "s1")).toEqual({ error: LAST_MANAGER_MESSAGE });
    expect(await leaveManagement(rpcClient({ error: { message: "network" } }).client, "s1")).toEqual({ error: "Couldn't remove you. Try again." });
    const { client, calls } = rpcClient({});
    expect(await leaveManagement(client, "s1")).toEqual({});
    expect(calls).toEqual([{ fn: "leave_society_management", args: { sid: "s1" } }]);
  });

  it("agrees to be a Founding Society, or says why not", async () => {
    const { client, calls } = rpcClient({});
    expect(await agreeToFounding(client, "s1")).toEqual({});
    expect(calls).toEqual([{ fn: "agree_to_founding", args: { sid: "s1" } }]);
    expect((await agreeToFounding(rpcClient({ error: { message: "This society isn't a Founding Society" } }).client, "s1")).error).toBe("This society isn't a Founding Society.");
  });
});
