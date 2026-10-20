import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { loadEvent } from "../src/events";
import { defaultFeatureKeys, FEATURE_GROUPS, FEATURES, featureConfig, featureSubject, hasFeature, loadSocietyFeatures, setSocietyFeature, setSocietyFeatures, SOCIETY_TYPES, type FeatureKey, type FeatureSubject } from "../src/features";

const LEGACY_SIX: FeatureKey[] = ["signup_lists", "tables", "ledger", "event_cost", "member_invites", "event_chats"];
const COMING_SOON: FeatureKey[] = [
  "custom_questions",
  "host_approval",
  "capacity_waitlist",
  "members_only_events",
  "google_form_import",
  "check_in_qr",
  "polls",
  "announcements",
  "recurring_events",
  "pinned_event",
  "society_branding",
  "committee_page",
  "photo_gallery",
  "tournament_brackets",
  "speaker_qa",
];
const legacy: FeatureSubject = { society_type: null, university: "LSE" };
const typed = (society_type: FeatureSubject["society_type"], university = "LSE", features?: FeatureSubject["features"]): FeatureSubject => ({ society_type, university, features });

describe("feature registry", () => {
  it("has unique keys in known groups", () => {
    const keys = FEATURES.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of FEATURES) expect(FEATURE_GROUPS).toContain(f.group);
  });

  it("describes every feature with an example", () => {
    for (const f of FEATURES) {
      expect(f.name.trim(), f.key).not.toBe("");
      expect(f.description.trim(), f.key).not.toBe("");
      expect(f.example.trim(), f.key).not.toBe("");
      expect(f.key).toMatch(/^[a-z][a-z0-9_]{1,40}$/);
    }
  });

  it("lists exactly the seven live features and the fifteen coming soon", () => {
    expect(FEATURES.filter((f) => f.status === "live").map((f) => f.key).sort()).toEqual([...LEGACY_SIX, "event_admin"].sort());
    expect(FEATURES.filter((f) => f.status === "coming_soon").map((f) => f.key).sort()).toEqual([...COMING_SOON].sort());
  });

  it("marks only the six existing features as legacy", () => {
    expect(FEATURES.filter((f) => f.legacy).map((f) => f.key).sort()).toEqual([...LEGACY_SIX].sort());
  });

  it("has six society types with labels and icons", () => {
    expect(SOCIETY_TYPES.map((t) => t.label)).toEqual(["Social", "Sports", "Cultural / Nationality", "Academic / Careers", "Games / Poker", "Arts / Performance"]);
    for (const t of SOCIETY_TYPES) expect(t.icon && t.description && t.example).toBeTruthy();
  });

  it("never says Function handles compliance", () => {
    for (const f of FEATURES) expect(`${f.name} ${f.description} ${f.example}`.toLowerCase()).not.toContain("complian");
  });
});

describe("hasFeature", () => {
  it("keeps the six existing features on for a society without a type, and nothing else", () => {
    for (const key of LEGACY_SIX) expect(hasFeature(legacy, key), key).toBe(true);
    expect(hasFeature(legacy, "event_admin")).toBe(false);
    for (const key of COMING_SOON) expect(hasFeature(legacy, key), key).toBe(false);
  });

  it("gives a typed society the defaults for its type", () => {
    const games = typed("games", "UCL");
    for (const key of LEGACY_SIX) expect(hasFeature(games, key), key).toBe(true);
    const academic = typed("academic", "UCL");
    expect(hasFeature(academic, "signup_lists")).toBe(true);
    expect(hasFeature(academic, "event_chats")).toBe(true);
    expect(hasFeature(academic, "member_invites")).toBe(true);
    expect(hasFeature(academic, "tables")).toBe(false);
    expect(hasFeature(academic, "ledger")).toBe(false);
    expect(hasFeature(academic, "event_cost")).toBe(false);
    const cultural = typed("cultural", "UCL");
    expect(hasFeature(cultural, "signup_lists")).toBe(false);
    expect(hasFeature(cultural, "event_cost")).toBe(true);
  });

  it("switches Event admin on for typed LSE societies only", () => {
    expect(hasFeature(typed("social", "LSE"), "event_admin")).toBe(true);
    expect(hasFeature(typed("social", "UCL"), "event_admin")).toBe(false);
    expect(hasFeature({ society_type: null, university: "LSE" }, "event_admin")).toBe(false);
  });

  it("lets a society's own choice win, both ways", () => {
    expect(hasFeature({ ...legacy, features: [{ feature_key: "tables", enabled: false }] }, "tables")).toBe(false);
    expect(hasFeature({ ...legacy, features: [{ feature_key: "event_admin", enabled: true }] }, "event_admin")).toBe(true);
    expect(hasFeature(typed("academic", "UCL", [{ feature_key: "tables", enabled: true }]), "tables")).toBe(true);
    expect(hasFeature(typed("games", "LSE", [{ feature_key: "event_admin", enabled: false }]), "event_admin")).toBe(false);
    // Other features are unaffected by a row for one.
    expect(hasFeature({ ...legacy, features: [{ feature_key: "tables", enabled: false }] }, "ledger")).toBe(true);
  });

  it("keeps coming-soon features off, even with a row switching them on", () => {
    expect(hasFeature(typed("social", "LSE", [{ feature_key: "polls", enabled: true }]), "polls")).toBe(false);
    expect(hasFeature({ ...legacy, features: [{ feature_key: "check_in_qr", enabled: true }] }, "check_in_qr")).toBe(false);
  });

  it("gives a student's own event (no society) chats and cost only", () => {
    expect(hasFeature(null, "event_chats")).toBe(true);
    expect(hasFeature(undefined, "event_cost")).toBe(true);
    for (const key of ["signup_lists", "tables", "ledger", "member_invites", "event_admin", "polls"] as FeatureKey[]) expect(hasFeature(null, key), key).toBe(false);
  });

  it("turns a nested select into a feature subject", () => {
    expect(featureSubject(null)).toBeNull();
    const s = featureSubject({ university: "LSE", society_type: "games", society_features: [{ feature_key: "tables", enabled: false }] });
    expect(s).toEqual({ society_type: "games", university: "LSE", features: [{ feature_key: "tables", enabled: false }] });
    expect(hasFeature(s, "tables")).toBe(false);
    // Before the migration: no type, no rows, so everything stays as it was.
    expect(hasFeature(featureSubject({ university: "LSE" }), "ledger")).toBe(true);
  });
});

describe("featureConfig", () => {
  it("returns the setting defaults", () => {
    expect(featureConfig(legacy, "tables")).toEqual({ default_seats: 8 });
    expect(featureConfig(null, "tables")).toEqual({ default_seats: 8 });
    expect(featureConfig(legacy, "ledger")).toEqual({});
  });

  it("lays the society's settings over the defaults", () => {
    const s = { ...legacy, features: [{ feature_key: "tables", enabled: true, config: { default_seats: 6, note: "x" } }] };
    expect(featureConfig(s, "tables")).toEqual({ default_seats: 6, note: "x" });
    expect(featureConfig({ ...legacy, features: [{ feature_key: "tables", enabled: true, config: null }] }, "tables")).toEqual({ default_seats: 8 });
  });
});

describe("defaultFeatureKeys", () => {
  it("pre-ticks each type's live features", () => {
    const sorted = (keys: FeatureKey[]) => [...keys].sort();
    expect(sorted(defaultFeatureKeys("social", "UCL"))).toEqual(sorted(["event_cost", "event_chats", "member_invites", "signup_lists"]));
    expect(sorted(defaultFeatureKeys("sports", "UCL"))).toEqual(sorted(["signup_lists", "event_cost", "event_chats", "member_invites"]));
    expect(sorted(defaultFeatureKeys("cultural", "UCL"))).toEqual(sorted(["event_cost", "event_chats", "member_invites"]));
    expect(sorted(defaultFeatureKeys("academic", "UCL"))).toEqual(sorted(["signup_lists", "event_chats", "member_invites"]));
    expect(sorted(defaultFeatureKeys("games", "UCL"))).toEqual(sorted(LEGACY_SIX));
    expect(sorted(defaultFeatureKeys("arts", "UCL"))).toEqual(sorted(["signup_lists", "event_cost", "event_chats", "member_invites"]));
  });

  it("adds Event admin at LSE and never a coming-soon feature", () => {
    expect(defaultFeatureKeys("cultural", "LSE")).toContain("event_admin");
    expect(defaultFeatureKeys("cultural", "KCL")).not.toContain("event_admin");
    for (const t of SOCIETY_TYPES) for (const key of defaultFeatureKeys(t.value, "LSE")) expect(FEATURES.find((f) => f.key === key)?.status).toBe("live");
  });
});

// A stand-in Supabase client: records each query and answers from a list.
function fakeClient(answers: { data?: unknown; error?: unknown }[]) {
  const calls: { table: string; select?: string; upsert?: unknown; options?: unknown }[] = [];
  const client = {
    from(table: string) {
      const call: (typeof calls)[number] = { table };
      calls.push(call);
      const answer = () => Promise.resolve(answers.shift() ?? { data: null, error: null });
      const chain = {
        select(columns: string) {
          call.select = columns;
          return chain;
        },
        eq: () => chain,
        maybeSingle: answer,
        upsert(rows: unknown, options: unknown) {
          call.upsert = rows;
          call.options = options;
          return answer();
        },
      };
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("loading and saving features", () => {
  it("loads a society's type, uni and rows in one query", async () => {
    const { client, calls } = fakeClient([{ data: { society_type: "games", university: "LSE", society_features: [{ feature_key: "tables", enabled: false, config: {} }] }, error: null }]);
    const s = await loadSocietyFeatures(client, "s1");
    expect(calls).toHaveLength(1);
    expect(calls[0].select).toContain("society_features(feature_key, enabled, config)");
    expect(hasFeature(s, "tables")).toBe(false);
    expect(hasFeature(s, "ledger")).toBe(true);
  });

  it("treats a society it can't read as one from before features", async () => {
    const { client } = fakeClient([{ data: null, error: { code: "42703" } }]);
    const s = await loadSocietyFeatures(client, "s1");
    expect(s.society_type).toBeNull();
    for (const key of ["signup_lists", "tables", "ledger", "event_cost", "member_invites", "event_chats"] as FeatureKey[]) expect(hasFeature(s, key)).toBe(true);
  });

  it("loads an event the old way if the features aren't in the database yet", async () => {
    const { client, calls } = fakeClient([{ data: null, error: { code: "PGRST200" } }, { data: { id: "e1", societies: { name: "Poker", university: "LSE" } }, error: null }]);
    const ev = await loadEvent(client, "00000000-0000-0000-0000-000000000001");
    expect(calls).toHaveLength(2);
    expect(calls[0].select).toContain("society_features");
    expect(calls[1].select).not.toContain("society_features");
    expect(hasFeature(featureSubject(ev?.societies), "ledger")).toBe(true);
  });

  it("upserts one feature, keeping its settings unless given", async () => {
    const { client, calls } = fakeClient([{ error: null }, { error: null }]);
    expect(await setSocietyFeature(client, "s1", "tables", false)).toEqual({});
    expect(calls[0].upsert).toEqual({ society_id: "s1", feature_key: "tables", enabled: false });
    expect(calls[0].options).toEqual({ onConflict: "society_id,feature_key" });
    await setSocietyFeature(client, "s1", "tables", true, { default_seats: 6 });
    expect(calls[1].upsert).toEqual({ society_id: "s1", feature_key: "tables", enabled: true, config: { default_seats: 6 } });
  });

  it("upserts several features in one go, and reports a failure", async () => {
    const { client, calls } = fakeClient([{ error: null }, { error: { code: "42501" } }]);
    expect(await setSocietyFeatures(client, "s1", { tables: true, ledger: false })).toEqual({});
    expect(calls).toHaveLength(1);
    expect(calls[0].upsert).toEqual([
      { society_id: "s1", feature_key: "tables", enabled: true },
      { society_id: "s1", feature_key: "ledger", enabled: false },
    ]);
    expect((await setSocietyFeatures(client, "s1", { event_chats: false })).error).toBeTruthy();
    expect(await setSocietyFeatures(client, "s1", {})).toEqual({});
    expect(calls).toHaveLength(2);
  });
});
