import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { EMPTY_ANSWERS, eventAdminFor } from "../src/event-admin";
import { publishEvent, saveEventAdminAndPublish, SU_APPROVAL_NEEDED } from "../src/committee";
import { withoutDrafts } from "../src/drafts";

type Res = { data: unknown; error: { code?: string; message?: string } | null; status?: number };

// A query that answers `filtered` when is_draft is filtered on, and `plain` without.
function query(filtered: Res, plain: Res, seen: string[]) {
  return () => ({
    eq: (column: string, value: boolean) => {
      seen.push(`${column}=${value}`);
      return Promise.resolve(filtered);
    },
    then: (ok: (r: Res) => unknown, fail?: (e: unknown) => unknown) => {
      seen.push("plain");
      return Promise.resolve(plain).then(ok, fail);
    },
  });
}

describe("withoutDrafts", () => {
  it("filters drafts out", async () => {
    const seen: string[] = [];
    const r = await withoutDrafts(query({ data: [1], error: null }, { data: [1, 2], error: null }, seen));
    expect(r.data).toEqual([1]);
    expect(seen).toEqual(["is_draft=false"]);
  });

  it("filters on an embedded column", async () => {
    const seen: string[] = [];
    await withoutDrafts(query({ data: [], error: null }, { data: [], error: null }, seen), "events.is_draft");
    expect(seen).toEqual(["events.is_draft=false"]);
  });

  it("loads as before when the draft column doesn't exist yet", async () => {
    for (const missing of [
      { data: null, error: { code: "42703", message: "column events.is_draft does not exist" }, status: 400 },
      { data: null, error: { message: "" }, status: 400 }, // a count-only request
    ]) {
      const seen: string[] = [];
      const r = await withoutDrafts(query(missing, { data: ["all"], error: null }, seen));
      expect(r.data).toEqual(["all"]);
      expect(seen).toEqual(["is_draft=false", "plain"]);
    }
  });

  it("passes other errors through", async () => {
    const seen: string[] = [];
    const r = await withoutDrafts(query({ data: null, error: { code: "42501", message: "permission denied" }, status: 401 }, { data: [], error: null }, seen));
    expect(r.error?.code).toBe("42501");
    expect(seen).toEqual(["is_draft=false"]);
  });
});

// A Supabase client that records writes; publishing fails while `gate` is set.
function fakeClient(opts: { gate?: boolean; failUpsert?: boolean } = {}) {
  const calls: string[] = [];
  const client = {
    from: (table: string) => ({
      upsert: (values: Record<string, unknown>) => {
        calls.push(`${table}.upsert ${Object.keys(values).includes("su_approved_at") ? `su_approved_at=${values.su_approved_at ? "set" : "null"}` : `answers form=${values.form}`}`);
        return Promise.resolve({ error: opts.failUpsert ? { message: "nope" } : null });
      },
      update: (values: Record<string, unknown>) => ({
        eq: () => ({
          select: () => {
            calls.push(`${table}.update is_draft=${values.is_draft}`);
            return Promise.resolve(opts.gate ? { data: null, error: { message: SU_APPROVAL_NEEDED } } : { data: [{ id: "e1" }], error: null });
          },
        }),
      }),
    }),
  };
  return { supabase: client as unknown as SupabaseClient, calls };
}

describe("saving event admin and publishing", () => {
  const answers = { ...EMPTY_ANSWERS, costLines: [], externalSpeaker: true };
  const result = eventAdminFor({ university: "LSE", answers, startsAt: "2026-12-14T19:00:00Z", today: "2026-10-20" });

  it("keeps a draft when the SU hasn't approved it", async () => {
    const { supabase, calls } = fakeClient();
    expect(await saveEventAdminAndPublish(supabase, "e1", { answers, result, suApproved: false }, { suApproved: false, draft: true })).toEqual({ published: false });
    expect(calls).toEqual(["event_admin.upsert answers form=large"]);
  });

  it("ticks SU approved, then publishes", async () => {
    const { supabase, calls } = fakeClient();
    expect(await saveEventAdminAndPublish(supabase, "e1", { answers, result, suApproved: true }, { suApproved: false, draft: true })).toEqual({ published: true });
    expect(calls).toEqual(["event_admin.upsert answers form=large", "event_admin.upsert su_approved_at=set", "events.update is_draft=false"]);
  });

  it("never publishes or unpublishes an event that's already published", async () => {
    const { supabase, calls } = fakeClient();
    expect(await saveEventAdminAndPublish(supabase, "e1", { answers, result, suApproved: false }, { suApproved: true, draft: false })).toEqual({ published: true });
    expect(calls).toEqual(["event_admin.upsert answers form=large", "event_admin.upsert su_approved_at=null"]);
  });

  it("stops at the first error, still a draft", async () => {
    const { supabase, calls } = fakeClient({ failUpsert: true });
    const r = await saveEventAdminAndPublish(supabase, "e1", { answers, result, suApproved: true }, { suApproved: false, draft: true });
    expect(r.published).toBe(false);
    expect(r.error).toBe("Couldn't save the event admin answers. Please try again.");
    expect(calls).toHaveLength(1);
  });

  it("passes the approval gate's message through", async () => {
    const { supabase } = fakeClient({ gate: true });
    expect(await publishEvent(supabase, "e1")).toEqual({ error: SU_APPROVAL_NEEDED });
    expect(SU_APPROVAL_NEEDED).toBe('Tick "SU approved" before publishing. LSESU must approve events before they\'re promoted.');
  });
});
