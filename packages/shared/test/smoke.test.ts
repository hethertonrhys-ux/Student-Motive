import { describe, expect, it } from "vitest";
import { checkEventSpan } from "../src/event-times";

describe("test runner", () => {
  it("runs shared code", () => {
    expect(checkEventSpan("2026-11-01T18:00:00Z", "2026-11-01T17:00:00Z").blocked).toBe(true);
  });
});
