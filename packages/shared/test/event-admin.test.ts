import { describe, expect, it } from "vitest";
import {
  addDays,
  BANK_HOLIDAYS_KNOWN_UNTIL,
  bankHolidaysKnown,
  budgetTotal,
  chooseForm,
  cleanAnswers,
  defaultAnswers,
  EMPTY_ANSWERS,
  ENGLAND_AND_WALES_BANK_HOLIDAYS,
  EVENT_ADMIN_UNAVAILABLE,
  eventAdminAvailable,
  eventAdminFor,
  endsLate,
  formatAdminDate,
  hazardsFor,
  isWorkingDay,
  londonDate,
  LSE_EVENT_ADMIN,
  subtractCalendarMonths,
  subtractWorkingDays,
  workingDaysBetween,
  type EventAdminAnswers,
  type EventAdminResult,
} from "../src/event-admin";
import { eventAdminAvailable as fromIndex } from "../src/index";

const answers = (extra: Partial<EventAdminAnswers> = {}): EventAdminAnswers => ({ ...EMPTY_ANSWERS, costLines: [], venueType: "campus", ...extra });

// An LSE event at 19:00–22:00 London time on a date, worked out "today".
function lse(date: string, extra: Partial<EventAdminAnswers> = {}, opts: { today?: string; costPence?: number | null; endsAt?: string } = {}): EventAdminResult {
  const result = eventAdminFor({
    university: "LSE",
    answers: answers(extra),
    startsAt: `${date}T19:00:00Z`,
    endsAt: opts.endsAt ?? `${date}T22:00:00Z`,
    costPence: opts.costPence ?? null,
    today: opts.today ?? "2026-10-20",
  });
  if (!result.available) throw new Error("expected LSE to be available");
  return result;
}

describe("bank holidays and working days", () => {
  it("lists England and Wales bank holidays to 2028", () => {
    expect(ENGLAND_AND_WALES_BANK_HOLIDAYS).toHaveLength(24);
    expect(ENGLAND_AND_WALES_BANK_HOLIDAYS).toContain("2026-12-28");
    expect(ENGLAND_AND_WALES_BANK_HOLIDAYS).toContain("2027-03-26");
    expect(ENGLAND_AND_WALES_BANK_HOLIDAYS).toContain("2028-01-03");
    expect(BANK_HOLIDAYS_KNOWN_UNTIL).toBe("2028-12-31");
  });

  it("knows weekends and bank holidays aren't working days", () => {
    expect(isWorkingDay("2026-11-20")).toBe(true); // Friday
    expect(isWorkingDay("2026-11-21")).toBe(false); // Saturday
    expect(isWorkingDay("2026-11-22")).toBe(false); // Sunday
    expect(isWorkingDay("2026-12-25")).toBe(false); // Christmas Day (Friday)
    expect(isWorkingDay("2026-12-28")).toBe(false); // Boxing Day substitute (Monday)
    expect(isWorkingDay("2026-12-29")).toBe(true);
  });

  it("counts working days back, not counting the date itself", () => {
    expect(subtractWorkingDays("2026-11-23", 1)).toBe("2026-11-20"); // Monday -> Friday
    expect(subtractWorkingDays("2026-11-26", 10)).toBe("2026-11-12");
    expect(subtractWorkingDays("2026-11-26", 0)).toBe("2026-11-26");
  });

  it("counts working days between two dates (the inverse of subtracting)", () => {
    expect(workingDaysBetween("2026-11-12", "2026-11-26")).toBe(10);
    expect(workingDaysBetween("2026-12-17", "2027-01-05")).toBe(10);
    expect(workingDaysBetween("2026-11-26", "2026-11-12")).toBe(-10);
    expect(workingDaysBetween("2026-11-20", "2026-11-20")).toBe(0);
    expect(workingDaysBetween("2026-11-20", "2026-11-23")).toBe(1);
  });

  it("goes back calendar months, clamping to the month's end and moving earlier off non-working days", () => {
    expect(subtractCalendarMonths("2026-11-26", 1)).toBe("2026-10-26"); // a Monday
    expect(subtractCalendarMonths("2026-12-14", 1)).toBe("2026-11-13"); // 14 Nov is a Saturday
    expect(subtractCalendarMonths("2027-03-31", 1)).toBe("2027-02-26"); // 28 Feb (clamped) is a Sunday
    expect(subtractCalendarMonths("2027-01-28", 1)).toBe("2026-12-24"); // past the weekend and two bank holidays
    expect(subtractCalendarMonths("2027-01-15", 1)).toBe("2026-12-15"); // across the year
  });

  it("flags dates after the bank holiday list, which only skip weekends", () => {
    expect(bankHolidaysKnown("2028-12-31")).toBe(true);
    expect(bankHolidaysKnown("2029-01-01")).toBe(false);
    // 1 January 2029 isn't listed, so it counts as a working day.
    expect(subtractWorkingDays("2029-01-02", 1)).toBe("2029-01-01");
    expect(lse("2029-03-01").bankHolidaysKnown).toBe(false);
    expect(lse("2027-03-01").bankHolidaysKnown).toBe(true);
  });

  it("works in London dates", () => {
    expect(londonDate("2026-07-01T23:30:00Z")).toBe("2026-07-02"); // BST
    expect(londonDate("2026-12-01T23:30:00Z")).toBe("2026-12-01"); // GMT
    expect(londonDate("2026-12-01")).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(formatAdminDate("2026-11-12")).toBe("Thu 12 Nov 2026");
  });
});

describe("which form", () => {
  const form = (extra: Partial<EventAdminAnswers>) => chooseForm(LSE_EVENT_ADMIN, answers(extra)).form;

  it("is the Regular Event Form when nothing makes it large", () => {
    const choice = chooseForm(LSE_EVENT_ADMIN, answers({ expectedAttendees: 40 }));
    expect(choice.form).toBe("regular");
    expect(choice.formName).toBe("Regular Event Form");
    expect(choice.noticeLabel).toBe("10 working days");
    expect(choice.reasons).toHaveLength(1);
  });

  it("is the Large / External Speaker Event Form for each trigger", () => {
    expect(form({ externalSpeaker: true })).toBe("large");
    expect(form({ expectedAttendees: 76 })).toBe("large");
    expect(form({ expectedAttendees: 75 })).toBe("regular");
    expect(form({ alcohol: "focus" })).toBe("large");
    expect(form({ alcohol: "available" })).toBe("regular");
    expect(form({ budgetPence: 50001 })).toBe("large");
    expect(form({ budgetPence: 50000 })).toBe("regular");
    // The cost lines add up to over £500, even though the budget typed in is less.
    expect(form({ budgetPence: 10000, costLines: [{ label: "Room", pence: 30000 }, { label: "Food", pence: 25000 }] })).toBe("large");
    expect(budgetTotal({ budgetPence: 10000, costLines: [{ label: "Room", pence: 30000 }, { label: "Food", pence: 25000 }] })).toBe(55000);
    const choice = chooseForm(LSE_EVENT_ADMIN, answers({ externalSpeaker: true, expectedAttendees: 120 }));
    expect(choice.formName).toBe("Large / External Speaker Event Form");
    expect(choice.noticeLabel).toBe("1 month");
    expect(choice.reasons).toEqual(["There's an external speaker or organisation.", "More than 75 people are expected."]);
  });

  it("is the Trip Form instead for anything outside London or overnight", () => {
    expect(form({ venueType: "away" })).toBe("trip");
    const choice = chooseForm(LSE_EVENT_ADMIN, answers({ venueType: "away", externalSpeaker: true, expectedAttendees: 200 }));
    expect(choice.form).toBe("trip");
    expect(choice.formName).toBe("Trip Form");
    expect(choice.noticeLabel).toBe("1 month");
  });
});

describe("eventAdminFor", () => {
  it("is only available at LSE", () => {
    expect(eventAdminAvailable("LSE")).toBe(true);
    expect(eventAdminAvailable("UCL")).toBe(false);
    expect(eventAdminAvailable(null)).toBe(false);
    expect(fromIndex("LSE")).toBe(true);
    expect(eventAdminFor({ university: "UCL", answers: answers(), startsAt: "2026-12-01T19:00:00Z" })).toEqual({ available: false, message: EVENT_ADMIN_UNAVAILABLE });
    expect(EVENT_ADMIN_UNAVAILABLE).toBe("Event admin isn't available for your uni yet.");
  });

  it("gives a regular event 10 working days' notice", () => {
    const r = lse("2026-11-26");
    expect(r.form).toBe("regular");
    expect(r.eventDate).toBe("2026-11-26");
    expect(r.submitBy).toBe("2026-11-12");
  });

  it("counts back past Christmas, Boxing Day, New Year and the weekends", () => {
    expect(lse("2027-01-05").submitBy).toBe("2026-12-17");
    expect(lse("2026-12-31").submitBy).toBe("2026-12-15");
  });

  it("gives a large event a month, moving a weekend deadline earlier", () => {
    const r = lse("2026-12-14", { externalSpeaker: true });
    expect(r.form).toBe("large");
    expect(r.submitBy).toBe("2026-11-13");
    expect(lse("2026-12-14", { venueType: "away" }).submitBy).toBe("2026-11-13");
  });

  it("is late only after the submit-by date", () => {
    expect(lse("2026-11-26", {}, { today: "2026-11-11" })).toMatchObject({ late: false, workingDaysLeft: 1 });
    expect(lse("2026-11-26", {}, { today: "2026-11-12" })).toMatchObject({ late: false, workingDaysLeft: 0 });
    expect(lse("2026-11-26", {}, { today: "2026-11-13" })).toMatchObject({ late: true, workingDaysLeft: -1 });
    expect(lse("2026-11-26", {}, { today: "2026-11-02" }).workingDaysLeft).toBe(8);
    // A moment, not a date: 00:30 on 13 November in London.
    expect(lse("2026-11-26", {}, { today: "2026-11-13T00:30:00Z" }).late).toBe(true);
  });

  it("lists the notes that apply, plus the ones that always do", () => {
    const plain = lse("2026-11-26");
    expect(plain.notes).toEqual([
      "Your committee submits the form on Podio, with a risk assessment.",
      "Events must be approved by LSESU before they're promoted.",
      "LSESU aims to reply within 5 working days.",
    ]);
    const all = lse("2026-11-26", { externalSpeaker: true, openToPublic: true, nonLseGuests: true, budgetPence: 2000 }, { costPence: 500 });
    expect(all.notes[0]).toBe("Your committee submits the form on Podio, with a risk assessment and a budget.");
    expect(all.notes).toContain("Paid tickets: Native is LSESU's only approved ticketing platform.");
    expect(all.notes).toContain("Non-LSE guests are coming, so the event needs tickets on Native.");
    expect(all.notes).toContain("External speakers at an event open to the public need an LSE academic to chair it.");
    expect(all.notes.some((n) => n.includes("Security reception by the day before"))).toBe(true);
    expect(all.notes).toHaveLength(7);
    // A speaker at a members' event: Security, but no chair.
    const members = lse("2026-11-26", { externalSpeaker: true });
    expect(members.notes.some((n) => n.includes("academic"))).toBe(false);
    expect(members.notes.some((n) => n.includes("Security reception"))).toBe(true);
  });

  it("builds the checklist with what's needed and the deadlines", () => {
    // Monday 23 November 2026, on campus, nothing else.
    const plain = lse("2026-11-23");
    const item = (r: EventAdminResult, key: string) => r.checklist.find((c) => c.key === key)!;
    expect(plain.checklist.map((c) => c.key)).toEqual(["form_submitted", "su_approved", "room_confirmed", "academic_chair", "native_tickets", "security_list"]);
    expect(item(plain, "form_submitted")).toMatchObject({ label: "Form submitted on Podio", needed: true, deadline: plain.submitBy });
    expect(item(plain, "su_approved")).toMatchObject({ label: "SU approved", needed: true, deadline: "2026-11-19" });
    expect(item(plain, "room_confirmed")).toMatchObject({ needed: true, deadline: "2026-11-16" });
    expect(item(plain, "academic_chair").needed).toBe(false);
    expect(item(plain, "native_tickets").needed).toBe(false);
    expect(item(plain, "security_list").needed).toBe(false);
    // Off campus, a public talk with a speaker, paid tickets.
    const talk = lse("2026-11-23", { venueType: "london", externalSpeaker: true, openToPublic: true }, { costPence: 300 });
    expect(item(talk, "room_confirmed").needed).toBe(false);
    expect(item(talk, "academic_chair")).toMatchObject({ label: "Academic chair secured", needed: true, deadline: "2026-11-09" });
    expect(item(talk, "native_tickets")).toMatchObject({ label: "Native tickets set up", needed: true, deadline: "2026-11-16" });
    expect(item(talk, "security_list")).toMatchObject({ label: "Security guest list sent", needed: true, deadline: "2026-11-20" });
    // Non-LSE guests alone need Native tickets and the Security list; a free event without guests doesn't.
    const guests = lse("2026-11-23", { nonLseGuests: true }, { costPence: 0 });
    expect(item(guests, "native_tickets").needed).toBe(true);
    expect(item(guests, "security_list").needed).toBe(true);
    expect(item(lse("2026-11-23", {}, { costPence: 0 }), "native_tickets").needed).toBe(false);
  });

  it("returns the cost lines and the budget total", () => {
    const r = lse("2026-11-26", { budgetPence: 20000, costLines: [{ label: " Room hire ", pence: 15000 }, { label: "", pence: 0 }, { label: "Pizza", pence: 9000 }] });
    expect(r.costLines).toEqual([{ label: "Room hire", pence: 15000 }, { label: "Pizza", pence: 9000 }]);
    expect(r.budgetTotalPence).toBe(24000);
  });
});

describe("hazards", () => {
  const keys = (extra: Partial<EventAdminAnswers>, endsAt = "2026-11-26T22:00:00Z") => hazardsFor({ answers: answers(extra), startsAt: "2026-11-26T19:00:00Z", endsAt }).map((h) => `${h.key}:${h.rating}`);

  it("has nothing for a small, quiet campus event", () => {
    expect(keys({ expectedAttendees: 50 })).toEqual([]);
  });

  it("chooses hazards and ratings from the answers", () => {
    expect(keys({ expectedAttendees: 51 })).toEqual(["crowding:medium"]);
    expect(keys({ expectedAttendees: 151 })).toEqual(["crowding:high"]);
    expect(keys({ alcohol: "available" })).toEqual(["alcohol:medium"]);
    expect(keys({ alcohol: "focus" })).toEqual(["alcohol:high"]);
    expect(keys({ venueType: "london" })).toEqual(["travel:low"]);
    expect(keys({ venueType: "away" })).toEqual(["travel:medium", "late_finish:medium", "weather:low"]);
    expect(keys({ physicalActivity: true })).toEqual(["physical_activity:medium", "weather:low"]);
    expect(keys({ food: true })).toEqual(["food:low"]);
    expect(keys({ externalSpeaker: true })).toEqual(["external_speaker:low"]);
    expect(keys({ externalSpeaker: true, openToPublic: true })).toEqual(["external_speaker:medium"]);
  });

  it("spots a late finish after 23:00 or before 05:00 London time", () => {
    expect(keys({}, "2026-11-26T23:30:00Z")).toEqual(["late_finish:low"]);
    expect(keys({}, "2026-11-26T23:00:00Z")).toEqual([]);
    expect(keys({}, "2026-11-27T01:00:00Z")).toEqual(["late_finish:low"]);
    // 22:30 UTC in July is 23:30 in London.
    expect(endsLate("2026-07-01T18:00:00Z", "2026-07-01T22:30:00Z")).toBe(true);
    expect(endsLate("2026-07-01T18:00:00Z", "2026-07-01T21:30:00Z")).toBe(false);
    // Starting and ending after midnight on the same London day.
    expect(endsLate("2026-11-27T00:30:00Z", "2026-11-27T03:00:00Z")).toBe(true);
    expect(endsLate("2026-11-27T03:00:00Z", "2026-11-27T05:00:00Z")).toBe(false);
  });

  it("gives each hazard who's at risk, controls and a reason", () => {
    const [h] = hazardsFor({ answers: answers({ alcohol: "focus" }) });
    expect(h.title).toBe("Alcohol");
    expect(h.whoAtRisk.length).toBeGreaterThan(0);
    expect(h.controls.some((c) => c.includes("Challenge 25"))).toBe(true);
    expect(h.reason).toBe("Alcohol is the focus of the event.");
  });
});

describe("defaultAnswers", () => {
  it("fills in what the event form already knows", () => {
    expect(defaultAnswers({ event: { capacity: 40, free_food: true, format: "entries" }, venue: { kind: "campus" }, societyUniversity: "LSE" })).toMatchObject({
      expectedAttendees: 40,
      venueType: "campus",
      food: true,
      alcohol: "none",
      externalSpeaker: false,
      nonLseGuests: false,
      openToPublic: false,
      budgetPence: null,
      costLines: [],
      physicalActivity: false,
      nativeUrl: "",
    });
  });

  it("counts the tables' seats, and uses 'other London venue' off campus", () => {
    const a = defaultAnswers({ event: { capacity: null, free_food: false, format: "tables" }, venue: { kind: "club" }, tables: [{ seats: 8 }, { seats: "6" }], societyUniversity: "LSE" });
    expect(a.expectedAttendees).toBe(14);
    expect(a.venueType).toBe("london");
    expect(a.food).toBe(false);
    expect(defaultAnswers({}).expectedAttendees).toBeNull();
    expect(defaultAnswers({ venue: null }).venueType).toBe("london");
  });
});

describe("cleanAnswers", () => {
  it("keeps answers within the database's limits", () => {
    const c = cleanAnswers(answers({ expectedAttendees: 999999, budgetPence: -5, speakerNames: "x".repeat(600), speakerOrg: "Org", externalSpeaker: false, nativeUrl: " https://native.fm/e/1 " }));
    expect(c.expectedAttendees).toBe(100000);
    expect(c.budgetPence).toBe(0);
    expect(c.speakerNames).toBe("");
    expect(c.speakerOrg).toBe("");
    expect(c.nativeUrl).toBe("https://native.fm/e/1");
    expect(cleanAnswers(answers({ externalSpeaker: true, speakerNames: "x".repeat(600) })).speakerNames).toHaveLength(500);
  });
});
