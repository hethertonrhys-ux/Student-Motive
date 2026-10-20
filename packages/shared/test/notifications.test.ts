import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getSocietyPosts } from "../src/notifications";

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
