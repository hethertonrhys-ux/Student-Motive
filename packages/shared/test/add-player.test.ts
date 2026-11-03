import { describe, expect, it } from "vitest";
import { matchMembers } from "../src";

// The "Add a player" box on a poker event's manage page: members whose name
// matches what's typed, best first.
const members = [{ name: "Sam Lee" }, { name: "Samira Khan" }, { name: "Jo Smith" }, { name: "Alex Samuels" }, { name: "Zoë Adams" }];

describe("matchMembers", () => {
  it("nothing typed, nothing suggested", () => {
    expect(matchMembers(members, "  ")).toEqual([]);
  });
  it("first names first, then later words, then anywhere", () => {
    expect(matchMembers(members, "sam").map((m) => m.name)).toEqual(["Sam Lee", "Samira Khan", "Alex Samuels"]);
    expect(matchMembers(members, "smi").map((m) => m.name)).toEqual(["Jo Smith"]);
    expect(matchMembers(members, "mue").map((m) => m.name)).toEqual(["Alex Samuels"]);
  });
  it("ignores accents and case", () => {
    expect(matchMembers(members, "ZOE").map((m) => m.name)).toEqual(["Zoë Adams"]);
  });
  it("keeps the list short", () => {
    expect(matchMembers(members, "a", 2)).toHaveLength(2);
  });
});
