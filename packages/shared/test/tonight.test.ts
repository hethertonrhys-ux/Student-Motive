import { describe, expect, it } from "vitest";
import { inWindow, nightEnds, type MapWindows } from "../src";

// "Tonight" and "Tomorrow" on the map and the What's on list (London time).
// The night belongs to the London calendar day, so at 3am on Thursday a plan
// for Thursday evening is Tonight, not Tomorrow.
const at = (iso: string) => Date.parse(iso);
const windows = (now: number): MapWindows => ({ now: new Date(now).toISOString(), tonightEnds: nightEnds(now), tomorrowEnds: nightEnds(now, 1) });
const when = (startsAt: string, endsAt: string, now: number) => (["tonight", "tomorrow"] as const).filter((w) => inWindow({ startsAt, endsAt }, w, windows(now), now));

// Thursday 22 Oct 2026 (British Summer Time, UTC+1). Thursday 19:00 BST = 18:00Z.
const thursdayEvening = ["2026-10-22T18:00:00Z", "2026-10-22T22:00:00Z"] as const;
const fridayEvening = ["2026-10-23T18:00:00Z", "2026-10-23T22:00:00Z"] as const;

describe("Tonight and Tomorrow", () => {
  it("in the afternoon: tonight runs to 6am Friday, tomorrow to 6am Saturday", () => {
    const now = at("2026-10-22T14:00:00Z"); // Thu 15:00
    expect(nightEnds(now)).toBe("2026-10-23T05:00:00.000Z");
    expect(nightEnds(now, 1)).toBe("2026-10-24T05:00:00.000Z");
    expect(when(...thursdayEvening, now)).toEqual(["tonight"]);
    expect(when(...fridayEvening, now)).toEqual(["tomorrow"]);
  });

  it("in the small hours of Thursday, Thursday evening is Tonight (the bug)", () => {
    const now = at("2026-10-22T02:00:00Z"); // Thu 03:00
    expect(nightEnds(now)).toBe("2026-10-23T05:00:00.000Z");
    expect(when(...thursdayEvening, now)).toEqual(["tonight"]);
    expect(when(...fridayEvening, now)).toEqual(["tomorrow"]);
    // Wednesday night's party, still going at 3am, is Tonight too.
    expect(when("2026-10-21T21:00:00Z", "2026-10-22T03:00:00Z", now)).toEqual(["tonight"]);
  });

  it("just before and just after 6am give the same night", () => {
    expect(nightEnds(at("2026-10-22T04:59:00Z"))).toBe("2026-10-23T05:00:00.000Z"); // Thu 05:59
    expect(nightEnds(at("2026-10-22T05:01:00Z"))).toBe("2026-10-23T05:00:00.000Z"); // Thu 06:01
  });

  it("after midnight it moves on to the new day", () => {
    expect(nightEnds(at("2026-10-22T22:59:00Z"))).toBe("2026-10-23T05:00:00.000Z"); // Thu 23:59
    const now = at("2026-10-22T23:01:00Z"); // Fri 00:01
    expect(nightEnds(now)).toBe("2026-10-24T05:00:00.000Z");
    // Thursday's event that's still on stays under Tonight.
    expect(when("2026-10-22T21:00:00Z", "2026-10-23T01:00:00Z", now)).toEqual(["tonight"]);
    expect(when(...fridayEvening, now)).toEqual(["tonight"]);
  });

  it("around the clocks going back (Sun 25 Oct 2026, 02:00 BST → 01:00 GMT)", () => {
    const now = at("2026-10-24T19:00:00Z"); // Sat 20:00 BST
    expect(nightEnds(now)).toBe("2026-10-25T06:00:00.000Z"); // Sun 06:00 GMT
    expect(nightEnds(now, 1)).toBe("2026-10-26T06:00:00.000Z"); // Mon 06:00 GMT
  });

  it("around the clocks going forward (Sun 29 Mar 2026, 01:00 GMT → 02:00 BST)", () => {
    const now = at("2026-03-28T12:00:00Z"); // Sat 12:00 GMT
    expect(nightEnds(now)).toBe("2026-03-29T05:00:00.000Z"); // Sun 06:00 BST
    expect(nightEnds(at("2026-03-29T01:30:00Z"))).toBe("2026-03-30T05:00:00.000Z"); // Sun 02:30 BST
  });

  it("ended events don't show", () => {
    const now = at("2026-10-22T23:30:00Z");
    expect(when(...thursdayEvening, now)).toEqual([]);
  });
});
