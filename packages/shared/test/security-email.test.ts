import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { checklistDoneAt, saveEventAdmin, setChecklistItem } from "../src/committee";
import { EMPTY_ANSWERS, eventAdminFor, nonUniGuests, SECURITY_EMAIL_FIRST_LINE, securityEmailDraft, type SecurityEmailPerson } from "../src/event-admin";
import { requestEventDocument, TEMPLATES_NOT_ADDED } from "../src/event-documents";

const people: SecurityEmailPerson[] = [
  { name: "Sam", fullName: "Sam Student", university: "LSE", status: "going" },
  { name: "Cas", fullName: "Cas Clark", university: "UCL", status: "going" },
  { name: "Kit", fullName: null, university: "KCL", status: "going" },
  { name: "Wren", fullName: "Wren Waiting", university: "UCL", status: "waitlist" },
  { name: "Nobody", fullName: "  Nora   Nouni ", university: null, status: "going" },
];

const input = {
  title: "Speaker Talk",
  startsAt: "2026-11-05T18:30:00Z",
  endsAt: "2026-11-05T20:30:00Z",
  venue: "Marshall Building · Room 1.04",
  societyName: "EA Test Society",
  speakerNames: "Dr Ada Lovelace",
  speakerOrg: "Royal Society",
  people,
  homeUniversity: "LSE",
};

describe("securityEmailDraft", () => {
  const draft = securityEmailDraft(input);

  it("lists the speakers, their organisation and the event", () => {
    expect(draft.subject).toBe("Guest list: Speaker Talk, Thu 5 Nov 2026");
    expect(draft.body).toContain("Event: Speaker Talk");
    expect(draft.body).toContain("Society: EA Test Society");
    expect(draft.body).toContain("Date: Thu 5 Nov 2026");
    expect(draft.body).toContain("Time: 18:30 to 20:30");
    expect(draft.body).toContain("Venue: Marshall Building · Room 1.04");
    expect(draft.body).toContain("External speaker(s): Dr Ada Lovelace");
    expect(draft.body).toContain("Organisation: Royal Society");
  });

  it("starts by asking for the Security reception address, with an empty To", () => {
    expect(draft.to).toBe("");
    expect(draft.body.split("\r\n")[0]).toBe(SECURITY_EMAIL_FIRST_LINE);
    expect(SECURITY_EMAIL_FIRST_LINE).toBe("Add your building's Security reception email above.");
    expect(draft.url.startsWith("mailto:?")).toBe(true);
  });

  it("lists only non-LSE people going, by full name when they've given one", () => {
    expect(draft.guests).toEqual(["Cas Clark", "Kit", "Nora Nouni"]);
    expect(draft.body).toContain("Non-LSE guests going (3):\r\nCas Clark\r\nKit\r\nNora Nouni");
    expect(draft.body).not.toContain("Sam Student");
    expect(draft.body).not.toContain("Wren");
  });

  it("never includes an email address", () => {
    const withEmails = securityEmailDraft({ ...input, people: [...people, { name: "Eve", fullName: "Eve Example", university: "UCL", status: "going", email: "eve@ucl.ac.uk" } as SecurityEmailPerson] });
    expect(withEmails.body).toContain("Eve Example");
    expect(withEmails.body).not.toMatch(/@/);
    expect(decodeURIComponent(withEmails.url)).not.toMatch(/@/);
  });

  it("encodes into a valid mailto: URL that decodes back to the draft", () => {
    const url = new URL(draft.url);
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe("");
    expect(url.searchParams.get("subject")).toBe(draft.subject);
    expect(url.searchParams.get("body")).toBe(draft.body);
    expect(draft.url).not.toMatch(/[\s\n]/);
    expect(draft.url).toContain("%0D%0A");
  });

  it("works with no speakers, no organisation and nobody from outside yet", () => {
    const quiet = securityEmailDraft({ ...input, speakerNames: "", speakerOrg: null, venue: null, people: [people[0]] });
    expect(quiet.body).toContain("External speaker(s): none");
    expect(quiet.body).not.toContain("Organisation:");
    expect(quiet.body).not.toContain("Venue:");
    expect(quiet.body).toContain("Non-LSE guests going: none so far.");
    expect(quiet.guests).toEqual([]);
  });

  it("gives the end date when it finishes on a later day (London time)", () => {
    const late = securityEmailDraft({ ...input, startsAt: "2026-11-05T22:00:00Z", endsAt: "2026-11-06T02:00:00Z" });
    expect(late.body).toContain("Time: 22:00 to 02:00 (Fri 6 Nov 2026)");
  });

  it("uses London time in summer", () => {
    const summer = securityEmailDraft({ ...input, startsAt: "2027-06-10T17:00:00Z", endsAt: "2027-06-10T19:00:00Z" });
    expect(summer.subject).toBe("Guest list: Speaker Talk, Thu 10 Jun 2027");
    expect(summer.body).toContain("Time: 18:00 to 20:00");
  });

  it("nonUniGuests works for another home uni", () => {
    expect(nonUniGuests(people, "UCL")).toEqual(["Kit", "Nora Nouni", "Sam Student"]);
  });
});

describe("requestEventDocument", () => {
  // A client whose functions.invoke answers like supabase-js does.
  function client(answer: { data?: unknown; status?: number; throws?: boolean; message?: string }) {
    const calls: { name: string; body: unknown }[] = [];
    const supabase = {
      functions: {
        invoke: async (name: string, opts: { body: unknown }) => {
          calls.push({ name, body: opts.body });
          if (answer.throws) throw new Error("network");
          if (answer.status && answer.status >= 300) {
            const response = new Response(JSON.stringify({ error: answer.message ?? "x" }), { status: answer.status });
            return { data: null, error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { name: "FunctionsHttpError", context: response }), response };
          }
          return { data: answer.data ?? null, error: null };
        },
      },
    };
    return { supabase: supabase as unknown as SupabaseClient, calls };
  }

  it("maps a 501 to the friendly 'Templates not added yet'", async () => {
    const { supabase, calls } = client({ status: 501 });
    expect(await requestEventDocument(supabase, "e1", "risk_assessment")).toEqual({ error: TEMPLATES_NOT_ADDED });
    expect(TEMPLATES_NOT_ADDED).toBe("Templates not added yet");
    expect(calls).toEqual([{ name: "event-documents", body: { eventId: "e1", kind: "risk_assessment" } }]);
  });

  it("says who can ask, and passes the link back once it works", async () => {
    expect(await requestEventDocument(client({ status: 403 }).supabase, "e1", "budget")).toEqual({ error: "Only the society's committee can do this." });
    expect(await requestEventDocument(client({ status: 401 }).supabase, "e1", "budget")).toEqual({ error: "Log in first." });
    expect(await requestEventDocument(client({ status: 500 }).supabase, "e1", "budget")).toEqual({ error: "Couldn't prepare the document. Please try again." });
    expect(await requestEventDocument(client({ throws: true }).supabase, "e1", "budget")).toEqual({ error: "Couldn't prepare the document. Please try again." });
    expect(await requestEventDocument(client({ data: { url: "https://x/signed" } }).supabase, "e1", "budget")).toEqual({ url: "https://x/signed" });
  });

  it("says when the event admin answers are missing, or the event can't be found", async () => {
    expect(await requestEventDocument(client({ status: 404 }).supabase, "e1", "budget")).toEqual({ error: "Add the event admin answers first." });
    expect(await requestEventDocument(client({ status: 404, message: "Add the event admin answers first" }).supabase, "e1", "budget")).toEqual({ error: "Add the event admin answers first." });
    expect(await requestEventDocument(client({ status: 404, message: "Event not found" }).supabase, "e1", "budget")).toEqual({ error: "That event couldn't be found." });
  });

  it("refuses an unknown kind without calling the server", async () => {
    const { supabase, calls } = client({ status: 501 });
    expect(await requestEventDocument(supabase, "e1", "minutes" as never)).toEqual({ error: "That document isn't available." });
    expect(calls).toHaveLength(0);
  });
});

describe("the checklist", () => {
  it("knows what's ticked: the committee's ticks, and SU approved from su_approved_at", () => {
    const row = { checklist: { form_submitted: { done_at: "2026-10-20T10:00:00Z", done_by: "u1" } }, su_approved_at: null };
    expect(checklistDoneAt(row, "form_submitted")).toBe("2026-10-20T10:00:00Z");
    expect(checklistDoneAt(row, "security_list")).toBeNull();
    expect(checklistDoneAt(row, "su_approved")).toBeNull();
    expect(checklistDoneAt({ checklist: null, su_approved_at: "2026-10-21T09:00:00Z" }, "su_approved")).toBe("2026-10-21T09:00:00Z");
    expect(checklistDoneAt({ checklist: { form_submitted: true as never }, su_approved_at: null }, "form_submitted")).toBeNull();
    expect(checklistDoneAt({ checklist: { form_submitted: { done_at: "x", done_by: "u1" } }, su_approved_at: null }, "form_submitted")).toBeNull();
    expect(checklistDoneAt(null, "form_submitted")).toBeNull();
  });

  function fake() {
    const calls: string[] = [];
    const supabase = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push(`${name} ${JSON.stringify(args)}`);
        return { data: {}, error: null };
      },
      from: (table: string) => ({
        upsert: async (values: Record<string, unknown>) => {
          calls.push(`${table}.upsert ${JSON.stringify(values, (k, v) => (k === "su_approved_at" && v ? "set" : v))}`);
          return { error: null };
        },
      }),
    };
    return { supabase: supabase as unknown as SupabaseClient, calls };
  }

  it("ticks an item on the server, and SU approved through su_approved_at", async () => {
    const { supabase, calls } = fake();
    expect(await setChecklistItem(supabase, "e1", "form_submitted", true)).toEqual({});
    expect(await setChecklistItem(supabase, "e1", "su_approved", true)).toEqual({});
    expect(calls).toEqual(['set_event_checklist_item {"eid":"e1","item":"form_submitted","done":true}', 'event_admin.upsert {"event_id":"e1","su_approved_at":"set"}']);
  });

  it("saves deadlines as { item: 'YYYY-MM-DD' } for the items the event needs, for the reminders", async () => {
    const { supabase, calls } = fake();
    const answers = { ...EMPTY_ANSWERS, costLines: [], externalSpeaker: true, openToPublic: true, venueType: "campus" as const };
    const result = eventAdminFor({ university: "LSE", answers, startsAt: "2026-12-14T19:00:00Z", costPence: 0, today: "2026-10-20" });
    expect(await saveEventAdmin(supabase, "e1", answers, result)).toEqual({});
    const saved = JSON.parse(calls[0].replace(/^event_admin\.upsert /, "")) as { deadlines: Record<string, string> };
    expect(Object.keys(saved.deadlines).sort()).toEqual(["academic_chair", "form_submitted", "room_confirmed", "security_list", "su_approved"]);
    for (const date of Object.values(saved.deadlines)) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(saved.deadlines.form_submitted).toBe(result.available ? result.submitBy : "");
    expect(saved.deadlines.security_list).toBe("2026-12-11");
  });
});
