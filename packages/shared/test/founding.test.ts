import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  checkFeatureRequest,
  FEATURE_REQUEST_STATUSES,
  featureRequestStatusLabel,
  foundingProgress,
  foundingProgressLine,
  lastEventText,
  loadFeatureInterestRanking,
  loadFoundingProgress,
  setFeatureRequestStatus,
  submitFeatureRequest,
  type FoundingEvent,
} from "../src/founding";

const DAY = 24 * 3600 * 1000;
const NOW = Date.parse("2026-11-20T12:00:00Z");
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const event = (daysAgo: number, going: number, extra: Partial<FoundingEvent> = {}): FoundingEvent => ({ createdAt: ago(daysAgo), cancelled: false, hidden: false, going, ...extra });
const progress = (agreedDaysAgo: number | null, events: FoundingEvent[], isFounding = true) =>
  foundingProgress({ isFounding, agreedAt: agreedDaysAgo == null ? null : ago(agreedDaysAgo), eventsTarget: 3, events, now: NOW });

// Any emoji or pictograph (the copy never uses them).
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;

// A Supabase client that fails the test if it is used at all.
const untouchable = new Proxy({}, { get: () => { throw new Error("the server was called"); } }) as unknown as SupabaseClient;

describe("prize-draw eligibility", () => {
  it("needs 3 published events since agreeing, each with someone going", () => {
    const p = progress(10, [event(6, 4), event(4, 1), event(3, 0)]);
    expect(p.eventsSince).toBe(3);
    expect(p.eventsWithRsvp).toBe(2);
    expect(p.eligible).toBe(false);
    expect(p.toGo).toBe(1);
    const q = progress(10, [event(6, 4), event(4, 1), event(3, 2)]);
    expect(q.eligible).toBe(true);
    expect(q.toGo).toBe(0);
  });

  it("doesn't count events from before agreeing", () => {
    const p = progress(10, [event(20, 5), event(12, 5), event(4, 1), event(3, 1)]);
    expect(p.eventsSince).toBe(2);
    expect(p.eligible).toBe(false);
  });

  it("counts an event made the moment they agreed", () => {
    expect(progress(10, [event(10, 1)]).eventsSince).toBe(1);
  });

  it("leaves out cancelled, hidden and draft events", () => {
    const p = progress(10, [event(6, 3), event(5, 3, { cancelled: true }), event(4, 3, { hidden: true }), event(3, 3, { draft: true }), event(2, 3)]);
    expect(p.eventsSince).toBe(2);
    expect(p.eventsWithRsvp).toBe(2);
    expect(p.eligible).toBe(false);
    // They don't count as the last event either.
    expect(p.lastEventAt).toBe(ago(2));
  });

  it("needs an agreement, and a Founding Society", () => {
    const events = [event(6, 1), event(4, 1), event(3, 1)];
    expect(progress(null, events).eligible).toBe(false);
    expect(progress(null, events).eventsSince).toBe(0);
    expect(progress(10, events, false).eligible).toBe(false);
  });

  it("counts more than the target, and never has a negative number to go", () => {
    const p = progress(30, [event(20, 1), event(15, 1), event(10, 1), event(5, 1), event(1, 1)]);
    expect(p.eventsSince).toBe(5);
    expect(p.eligible).toBe(true);
    expect(p.toGo).toBe(0);
  });
});

describe("the Founding Society badge", () => {
  it("is on for 30 days after agreeing, even before any event", () => {
    expect(progress(10, []).badgeActive).toBe(true);
    expect(progress(29, []).badgeActive).toBe(true);
  });

  it("is off when they agreed 40 days ago and posted nothing", () => {
    expect(progress(40, []).badgeActive).toBe(false);
  });

  it("stays on while the last event is under 30 days old", () => {
    expect(progress(60, [event(29, 0)]).badgeActive).toBe(true);
    expect(progress(60, [event(31, 0)]).badgeActive).toBe(false);
  });

  it("comes back on when they post again", () => {
    const events = [event(45, 2)];
    expect(progress(60, events).badgeActive).toBe(false);
    expect(progress(60, [...events, event(0, 0)]).badgeActive).toBe(true);
  });

  it("isn't turned back on by a cancelled, hidden or draft event", () => {
    expect(progress(60, [event(45, 2), event(1, 0, { cancelled: true }), event(1, 0, { hidden: true }), event(1, 0, { draft: true })]).badgeActive).toBe(false);
  });

  it("counts an event from before agreeing as the last event", () => {
    const p = progress(35, [event(40, 1)]);
    expect(p.lastEventAt).toBe(ago(40));
    expect(p.daysSinceLastEvent).toBe(40);
    expect(p.eventsSince).toBe(0);
    expect(p.badgeActive).toBe(false);
  });

  it("is off for a society that isn't Founding, or hasn't agreed", () => {
    expect(progress(5, [event(1, 3)], false).badgeActive).toBe(false);
    expect(progress(null, [event(1, 3)]).badgeActive).toBe(false);
  });

  it("works out the days since the last event", () => {
    expect(progress(10, []).daysSinceLastEvent).toBeNull();
    expect(progress(10, [event(3.5, 0), event(8, 0)]).daysSinceLastEvent).toBe(3);
    expect(progress(10, [event(0.2, 0)]).daysSinceLastEvent).toBe(0);
  });
});

describe("the progress line", () => {
  const line = (agreedDaysAgo: number | null, events: FoundingEvent[]) => foundingProgressLine(progress(agreedDaysAgo, events));

  it("says how many to go", () => {
    expect(line(10, [event(6, 1), event(4, 1)])).toBe("2 of 3 events posted, 1 to go for the prize draw");
    expect(line(10, [])).toBe("0 of 3 events posted, 3 to go for the prize draw");
  });

  it("says when they're in the prize draw", () => {
    expect(line(10, [event(6, 1), event(4, 1), event(3, 1)])).toBe("3 of 3 events posted. You're in the prize draw.");
    // More than the target still reads 3 of 3.
    expect(line(30, [event(20, 1), event(15, 1), event(10, 1), event(5, 1)])).toBe("3 of 3 events posted. You're in the prize draw.");
  });

  it("explains an event without anyone going doesn't count yet", () => {
    expect(line(10, [event(6, 1), event(4, 1), event(3, 0)])).toBe("3 of 3 events posted, 1 to go for the prize draw. An event counts once someone's going.");
  });

  it("asks a society that hasn't agreed to agree first", () => {
    expect(line(null, [event(3, 1)])).toBe("Agree to the Founding Society terms to start counting your events.");
  });

  it("is plain text", () => {
    for (const l of [line(10, []), line(10, [event(6, 1), event(4, 1), event(3, 1)]), line(10, [event(3, 0)]), line(null, [])]) expect(l).not.toMatch(EMOJI);
  });

  it("describes the last event", () => {
    expect(lastEventText(null)).toBe("No events yet");
    expect(lastEventText(0)).toBe("Last event today");
    expect(lastEventText(1)).toBe("Last event yesterday");
    expect(lastEventText(12)).toBe("Last event 12 days ago");
  });
});

describe("feature requests", () => {
  it("has four statuses with labels", () => {
    expect(FEATURE_REQUEST_STATUSES.map((s) => s.label)).toEqual(["New", "Building", "Live", "Declined"]);
    expect(featureRequestStatusLabel("live")).toBe("Live");
  });

  it("trims what the committee typed and checks its length", () => {
    expect(checkFeatureRequest("  QR check-in  ", "   ")).toEqual({ need: "QR check-in", currentProcess: null });
    expect(checkFeatureRequest("Polls", " A WhatsApp poll ")).toEqual({ need: "Polls", currentProcess: "A WhatsApp poll" });
    expect(checkFeatureRequest(" ab ", null)).toHaveProperty("error");
    expect(checkFeatureRequest("x".repeat(1001), null)).toHaveProperty("error");
    expect(checkFeatureRequest("Fine", "x".repeat(1001))).toHaveProperty("error");
    expect(checkFeatureRequest("x".repeat(1000), "y".repeat(1000))).toEqual({ need: "x".repeat(1000), currentProcess: "y".repeat(1000) });
  });

  it("doesn't send a request that is too short", async () => {
    expect(await submitFeatureRequest(untouchable, "s1", "  a ")).toEqual({ error: "Tell us what you need (a few words is enough)." });
  });

  it("sends the trimmed request", async () => {
    const inserted: unknown[] = [];
    const client = { from: (table: string) => ({ insert: (row: unknown) => { inserted.push({ table, row }); return Promise.resolve({ error: null }); } }) } as unknown as SupabaseClient;
    expect(await submitFeatureRequest(client, "s1", "  Polls in the chat ", "  ")).toEqual({});
    expect(inserted).toEqual([{ table: "feature_requests", row: { society_id: "s1", need: "Polls in the chat", current_process: null } }]);
  });

  it("reports a status change the database refused (no row back)", async () => {
    const calls: unknown[] = [];
    const client = (rows: unknown[]) => ({
      from: () => ({ update: (patch: unknown) => ({ eq: () => ({ select: () => { calls.push(patch); return Promise.resolve({ data: rows, error: null }); } }) }) }),
    }) as unknown as SupabaseClient;
    expect(await setFeatureRequestStatus(client([]), "r1", "live")).toEqual({ error: "Couldn't save. Try again." });
    expect(await setFeatureRequestStatus(client([{ id: "r1" }]), "r1", "building", "  Next week  ")).toEqual({});
    expect(await setFeatureRequestStatus(client([{ id: "r1" }]), "r1", "declined")).toEqual({});
    expect(calls).toEqual([{ status: "live" }, { status: "building", admin_note: "Next week" }, { status: "declined" }]);
    expect(await setFeatureRequestStatus(untouchable, "r1", "maybe" as never)).toEqual({ error: "Pick a status." });
  });
});

describe("loading", () => {
  it("maps the progress row, and gives null when there is none", async () => {
    const rpc = (data: unknown) => ({ rpc: () => Promise.resolve({ data, error: null }) }) as unknown as SupabaseClient;
    expect(await loadFoundingProgress(rpc([]), "s1")).toBeNull();
    const p = await loadFoundingProgress(rpc([{ is_founding: true, agreed_at: ago(10), events_target: 3, events_since: 3, events_with_rsvp: 2, last_event_at: ago(3), days_since_last_event: 3, eligible: false, badge_active: true }]), "s1");
    expect(p).toMatchObject({ isFounding: true, eventsSince: 3, eventsWithRsvp: 2, eligible: false, badgeActive: true, toGo: 1, daysSinceLastEvent: 3 });
    expect(foundingProgressLine(p!)).toBe("3 of 3 events posted, 1 to go for the prize draw. An event counts once someone's going.");
  });

  it("names the wanted features from the registry", async () => {
    const client = { rpc: () => Promise.resolve({ data: [{ feature_key: "polls", societies: 2, society_names: ["A", "B"] }, { feature_key: "mystery_key", societies: 1, society_names: null }], error: null }) } as unknown as SupabaseClient;
    expect(await loadFeatureInterestRanking(client)).toEqual([
      { key: "polls", name: "Polls", societies: 2, societyNames: ["A", "B"] },
      { key: "mystery_key", name: "mystery_key", societies: 1, societyNames: [] },
    ]);
  });
});
