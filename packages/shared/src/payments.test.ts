import { describe, expect, it } from "vitest";
import { chargeFor, pounds, sharePerPerson, statementSuffix, stripeFee } from "./payments";

describe("paid plans", () => {
  it("splits the total across every space, rounding up", () => {
    expect(sharePerPerson(8000, 10)).toBe(800);
    expect(sharePerPerson(8000, 3)).toBe(2667);
    expect(sharePerPerson(0, 10)).toBe(0);
  });

  it("adds a service fee so the host gets the whole share", () => {
    const c = chargeFor(800, "added");
    expect(c).toMatchObject({ share: 800, toHost: 800 });
    expect(c.amount).toBe(833);
    expect(c.fee).toBe(33);
    // Stripe's fee on what's charged is covered by Function's part.
    expect(c.appFee).toBeGreaterThanOrEqual(stripeFee(c.amount));
  });

  it("covers Stripe's fee for any share", () => {
    for (let share = 100; share <= 100000; share += 37) {
      const c = chargeFor(share, "added");
      expect(c.amount - c.appFee).toBe(share);
      expect(c.appFee).toBeGreaterThanOrEqual(stripeFee(c.amount));
      expect(c.appFee).toBeLessThan(c.amount);
    }
  });

  it("takes the fee from the host's share when they absorb it", () => {
    const c = chargeFor(800, "absorbed");
    expect(c).toEqual({ amount: 800, share: 800, fee: 0, appFee: 32, toHost: 768 });
  });

  it("shows pounds", () => {
    expect(pounds(800)).toBe("£8.00");
    expect(pounds(2667)).toBe("£26.67");
  });

  it("puts a short version of the plan's name on bank statements", () => {
    expect(statementSuffix("Powerleague")).toBe("POWERLEAGUE");
    expect(statementSuffix("Powerleague 5-a-side Friday")).toBe("POWERLEAGUE");
    expect(statementSuffix("Five a side footy")).toBe("FIVE A SIDE");
    expect(statementSuffix("Café crawl!")).toBe("CAFE CRAWL");
    expect(statementSuffix("2024")).toBe("PLAN");
    expect(statementSuffix("")).toBe("PLAN");
    for (const t of ["A very long plan title indeed", "Supercalifragilisticexpialidocious"]) {
      expect(statementSuffix(t).length).toBeLessThanOrEqual(12);
    }
  });
});
