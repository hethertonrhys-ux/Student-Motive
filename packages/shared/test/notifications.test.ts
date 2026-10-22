import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getSocietyPosts, groupTwoTruthsPlays, twoTruthsLine } from "../src/notifications";

type Res = { data: unknown; error: { code?: string; message?: string } | null; status?: number };

// A Supabase client whose queries record each call and answer with `answer`
// (given the table and the calls made) when awaited.
function fakeClient(answer: (table: string, calls: string[]) => Res) {
  const queries: { table: string; calls: string[] }[] = [];
  const client = {
    from(table: string) {
      const calls: string[] = [];
      queries.push({ table, calls });
      const query: object = new Proxy(
        {},
        {
          get: (_target, prop) =>
            prop === "then"
              ? (ok: (r: Res) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(answer(table, calls)).then(ok, fail)
              : (...args: unknown[]) => {
                  calls.push(`${String(prop)}(${args.map((a) => JSON.stringify(a)).join(",")})`);
                  return query;
                },
        },
      );
      return query;
    },
  };
  return { client: client as unknown as SupabaseClient, queries };
}

const member: Res = { data: [{ society_id: "soc-1" }], error: null };

describe("society posts in Notifications", () => {
  it("dates each event by when it was published", async () => {
    const { client, queries } = fakeClient((table) =>
      table === "society_members"
        ? member
        : { data: [{ id: "e1", title: "Quiz", created_at: "2026-10-01T10:00:00Z", published_at: "2026-10-19T09:00:00Z", societies: { name: "Quiz Soc" } }], error: null },
    );
    const posts = await getSocietyPosts(client, "me");
    expect(posts).toEqual([{ id: "e1", title: "Quiz", society: "Quiz Soc", at: "2026-10-19T09:00:00Z" }]);
    const events = queries.filter((q) => q.table === "events");
    expect(events).toHaveLength(1);
    expect(events[0].calls).toContain('eq("is_draft",false)');
    expect(events[0].calls.some((c) => c.startsWith('gte("published_at"'))).toBe(true);
    expect(events[0].calls).toContain('order("published_at",{"ascending":false})');
  });

  it("falls back to when it was created before the column exists", async () => {
    const { client, queries } = fakeClient((table, calls) => {
      if (table === "society_members") return member;
      if (calls.some((c) => c.includes("published_at"))) return { data: null, error: { code: "42703", message: "column events.published_at does not exist" }, status: 400 };
      if (calls.some((c) => c.includes("is_draft"))) return { data: null, error: { code: "42703", message: "column events.is_draft does not exist" }, status: 400 };
      return { data: [{ id: "e1", title: "Quiz", created_at: "2026-10-01T10:00:00Z", societies: { name: "Quiz Soc" } }], error: null };
    });
    const posts = await getSocietyPosts(client, "me");
    expect(posts).toEqual([{ id: "e1", title: "Quiz", society: "Quiz Soc", at: "2026-10-01T10:00:00Z" }]);
    const events = queries.filter((q) => q.table === "events");
    expect(events.length).toBeGreaterThan(1);
    expect(events.at(-1)?.calls).toContain('order("created_at",{"ascending":false})');
  });

  it("asks for nothing when you're in no society", async () => {
    const { client, queries } = fakeClient(() => ({ data: [], error: null }));
    expect(await getSocietyPosts(client, "me")).toEqual([]);
    expect(queries.filter((q) => q.table === "events")).toHaveLength(0);
  });
});

describe("Two truths and a lie: who played", () => {
  const p = (name: string, right: boolean, at: string) => ({ id: name.toLowerCase(), name, avatarUrl: null, right, at });
  it("groups plays by UK day, newest day first, and names one player", () => {
    const days = groupTwoTruthsPlays([p("Sam", true, "2026-10-21T22:30:00Z"), p("Bea", false, "2026-10-22T09:00:00Z")]);
    // 22:30 UTC on the 21st is 23:30 in London: still the 21st.
    expect(days.map((d) => d.day)).toEqual(["2026-10-22", "2026-10-21"]);
    expect(twoTruthsLine(days[1])).toMatchObject({ played: "Sam played your Two truths and a lie", right: "They spotted the lie!", more: 0 });
    expect(twoTruthsLine(days[0]).right).toBe("They didn't spot the lie.");
  });
  it("names up to three, then 'and N more'", () => {
    const three = groupTwoTruthsPlays([p("Sam", true, "2026-10-22T10:00:00Z"), p("Bea", false, "2026-10-22T11:00:00Z"), p("Cas", true, "2026-10-22T12:00:00Z")]);
    expect(twoTruthsLine(three[0])).toMatchObject({ played: "Sam, Bea and Cas played your Two truths and a lie", right: "2 of them spotted the lie.", more: 0 });
    const five = groupTwoTruthsPlays(["Sam", "Bea", "Cas", "Dev", "Eve"].map((n, i) => p(n, false, `2026-10-22T1${i}:00:00Z`)));
    const line = twoTruthsLine(five[0]);
    expect(line).toMatchObject({ played: "Sam, Bea and 3 more played your Two truths and a lie", right: "Nobody spotted the lie.", more: 3 });
    expect(line.shown.map((x) => x.name)).toEqual(["Sam", "Bea"]);
    expect(five[0].at).toBe("2026-10-22T10:00:00Z");
  });
});
