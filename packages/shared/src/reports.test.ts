import { describe, expect, it, vi } from "vitest";
import { banLabel, REPORT_REASONS, sendReport } from "./reports";

function fakeSupabase() {
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const client = {
    from: (table: string) => ({
      insert: vi.fn(async (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return { error: null };
      }),
    }),
  };
  return { client: client as never, inserts };
}

const ID = "3f2b1c4d-1111-4222-8333-444455556666";

describe("reports", () => {
  it("offers the five reasons", () => {
    expect(REPORT_REASONS).toEqual(["Harassment or bullying", "Inappropriate or explicit content", "Spam", "Fake account", "Something else"]);
  });

  it("files each kind of report in the right place, with the note", async () => {
    const { client, inserts } = fakeSupabase();
    await sendReport(client, { kind: "message", id: ID }, "Spam", " buy followers ");
    await sendReport(client, { kind: "event", id: ID }, "Something else", "");
    await sendReport(client, { kind: "user", id: ID }, "Fake account", "");
    await sendReport(client, { kind: "social", id: ID }, "Harassment or bullying", "note");
    await sendReport(client, { kind: "photo", id: ID }, "Inappropriate or explicit content", "nudity");
    expect(inserts).toEqual([
      { table: "reports", row: { message_id: ID, reason: "Spam", details: "buy followers" } },
      { table: "reports", row: { event_id: ID, reason: "Something else", details: null } },
      { table: "reports", row: { reported_user_id: ID, reason: "Fake account", details: null } },
      { table: "social_reports", row: { event_id: ID, reason: "Harassment or bullying", details: "note" } },
      { table: "profile_photo_reports", row: { photo_id: ID, reason: "Inappropriate or explicit content: nudity" } },
    ]);
  });

  it("needs a reason", async () => {
    const { client, inserts } = fakeSupabase();
    expect(await sendReport(client, { kind: "user", id: ID }, "", "")).toEqual({ error: "Choose a reason." });
    expect(inserts).toHaveLength(0);
  });

  it("describes a ban", () => {
    const now = Date.parse("2026-10-21T12:00:00Z");
    expect(banLabel(null, now)).toBeNull();
    expect(banLabel({ until: null }, now)).toBe("Banned");
    expect(banLabel({ until: "2026-10-28T12:00:00Z" }, now)).toBe("Suspended until Wed 28 Oct");
    expect(banLabel({ until: "2026-10-20T12:00:00Z" }, now)).toBeNull();
  });
});
