import { hazardsFor } from "./hazards";
import { LSE_EVENT_ADMIN, type RuleContext, type UniEventAdminConfig } from "./lse";
import type { ChecklistItem, CostLine, EventAdminAnswers, EventAdminForm, Hazard, VenueType } from "./types";
import { bankHolidaysKnown, londonDate, subtractCalendarMonths, subtractWorkingDays, workingDaysBetween } from "./working-days";

// Event admin: the SU paperwork for a society's event. From the
// committee's answers it works out which form the event needs, when to
// submit it by, the checklist with its deadlines, the notes that apply and a
// risk assessment preview. Function prepares this; the committee checks it
// and submits it to their SU. One config per uni: LSE so far (lse.ts).

export * from "./bank-holidays";
export * from "./hazards";
export * from "./lse";
export * from "./types";
export * from "./working-days";

const CONFIGS: Record<string, UniEventAdminConfig> = { LSE: LSE_EVENT_ADMIN };

export const EVENT_ADMIN_UNIS: string[] = ["LSE"];

export const EVENT_ADMIN_UNAVAILABLE = "Event admin isn't available for your uni yet.";

// Is event admin set up for this uni ("LSE", "UCL"…)?
export const eventAdminAvailable = (university: string | null | undefined) => !!university && EVENT_ADMIN_UNIS.includes(university) && !!CONFIGS[university];

export const eventAdminConfig = (university: string | null | undefined): UniEventAdminConfig | null => (university && eventAdminAvailable(university) ? CONFIGS[university] : null);

// ---- Answers ----

export const EMPTY_ANSWERS: EventAdminAnswers = {
  expectedAttendees: null,
  venueType: "london",
  alcohol: "none",
  externalSpeaker: false,
  speakerNames: "",
  speakerOrg: "",
  nonLseGuests: false,
  openToPublic: false,
  budgetPence: null,
  costLines: [],
  physicalActivity: false,
  food: false,
  nativeUrl: "",
};

export const MAX_COST_LINES = 30;

const whole = (value: unknown, max: number): number | null => {
  const n = typeof value === "string" ? Number(value.trim()) : typeof value === "number" ? value : NaN;
  if (value === "" || value == null || !Number.isFinite(n)) return null;
  return Math.min(max, Math.max(0, Math.round(n)));
};

// Answers as they can be stored: lengths and numbers within the database's
// limits, cost lines with something in them, the speaker only with a speaker.
export function cleanAnswers(answers: EventAdminAnswers): EventAdminAnswers {
  const lines = (answers.costLines ?? [])
    .map((l) => ({ label: String(l.label ?? "").trim().slice(0, 80), pence: whole(l.pence, 100000000) ?? 0 }))
    .filter((l) => l.label || l.pence > 0)
    .slice(0, MAX_COST_LINES);
  return {
    expectedAttendees: whole(answers.expectedAttendees, 100000),
    venueType: (["campus", "london", "away"] as VenueType[]).includes(answers.venueType) ? answers.venueType : "london",
    alcohol: (["none", "available", "focus"] as const).includes(answers.alcohol) ? answers.alcohol : "none",
    externalSpeaker: answers.externalSpeaker === true,
    speakerNames: answers.externalSpeaker ? String(answers.speakerNames ?? "").trim().slice(0, 500) : "",
    speakerOrg: answers.externalSpeaker ? String(answers.speakerOrg ?? "").trim().slice(0, 200) : "",
    nonLseGuests: answers.nonLseGuests === true,
    openToPublic: answers.openToPublic === true,
    budgetPence: whole(answers.budgetPence, 100000000),
    costLines: lines,
    physicalActivity: answers.physicalActivity === true,
    food: answers.food === true,
    nativeUrl: String(answers.nativeUrl ?? "").trim().slice(0, 500),
  };
}

// The larger of the budget typed in and the cost lines added up.
export function budgetTotal(answers: Pick<EventAdminAnswers, "budgetPence" | "costLines">): number {
  const lines = (answers.costLines ?? []).reduce((sum, l) => sum + (Number.isFinite(l.pence) && l.pence > 0 ? l.pence : 0), 0);
  return Math.max(answers.budgetPence ?? 0, lines);
}

const pounds = (pence: number) => `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`;

// The answers the form starts with, from what the event form already
// knows: how many people (its limit, or its tables' seats), whether the
// venue is on LSE's campus, and free food. Everything else starts off.
export function defaultAnswers({
  event,
  venue,
  tables,
  societyUniversity,
}: {
  event?: { capacity?: number | string | null; free_food?: boolean | null; format?: string | null } | null;
  venue?: { kind?: string | null } | null;
  tables?: { seats: number | string }[] | null;
  societyUniversity?: string | null;
}): EventAdminAnswers {
  const capacity = whole(event?.capacity ?? null, 100000);
  const seats = (event?.format == null || event.format === "tables") && tables?.length ? tables.reduce((sum, t) => sum + (whole(t.seats, 1000) ?? 0), 0) : 0;
  return {
    ...EMPTY_ANSWERS,
    costLines: [],
    expectedAttendees: capacity && capacity > 0 ? capacity : seats > 0 ? seats : null,
    // The campus venues are LSE's buildings.
    venueType: venue?.kind === "campus" && (societyUniversity ?? "LSE") === "LSE" ? "campus" : "london",
    food: event?.free_food === true,
  };
}

// ---- Which form ----

export type FormChoice = { form: EventAdminForm; formName: string; reasons: string[]; noticeLabel: string };

// Which form an event needs, and why (in plain English).
export function chooseForm(config: UniEventAdminConfig, answers: EventAdminAnswers): FormChoice {
  const pick = (form: EventAdminForm, reasons: string[]): FormChoice => ({ form, formName: config.forms[form].name, reasons, noticeLabel: config.forms[form].notice.label });
  if (answers.venueType === "away") return pick("trip", ["It's outside London (beyond the M25) or overnight, so it's a trip."]);
  const reasons: string[] = [];
  const total = budgetTotal(answers);
  if (answers.externalSpeaker) reasons.push("There's an external speaker or organisation.");
  if (answers.expectedAttendees != null && answers.expectedAttendees > config.large.attendeesOver) reasons.push(`More than ${config.large.attendeesOver} people are expected.`);
  if (answers.alcohol === "focus") reasons.push("Alcohol is the focus of the event.");
  if (total > config.large.budgetOverPence) reasons.push(`The budget is over ${pounds(config.large.budgetOverPence)}.`);
  if (reasons.length) return pick("large", reasons);
  return pick("regular", [`No external speaker, ${config.large.attendeesOver} people or fewer, alcohol isn't the focus and the budget is ${pounds(config.large.budgetOverPence)} or less.`]);
}

// ---- Everything for one event ----

export type EventAdminUnavailable = { available: false; message: string };

export type EventAdminResult = FormChoice & {
  available: true;
  // The event's London date.
  eventDate: string;
  // The last day to submit the form ('YYYY-MM-DD').
  submitBy: string;
  // Today is after the submit-by date.
  late: boolean;
  // Working days from today until the submit-by date (0 on the day; negative when late).
  workingDaysLeft: number;
  notes: string[];
  checklist: ChecklistItem[];
  hazards: Hazard[];
  costLines: CostLine[];
  budgetTotalPence: number;
  // False when the event is after the bank holiday list ends (only weekends are skipped then).
  bankHolidaysKnown: boolean;
};

export function eventAdminFor({
  university,
  answers: raw,
  startsAt,
  endsAt,
  costPence,
  today = Date.now(),
}: {
  university: string | null | undefined;
  answers: EventAdminAnswers;
  startsAt: string | number | Date;
  endsAt?: string | number | Date | null;
  costPence?: number | null;
  today?: string | number | Date;
}): EventAdminResult | EventAdminUnavailable {
  const config = eventAdminConfig(university);
  if (!config) return { available: false, message: EVENT_ADMIN_UNAVAILABLE };
  const answers = cleanAnswers(raw);
  const choice = chooseForm(config, answers);
  const eventDate = londonDate(startsAt);
  const notice = config.forms[choice.form].notice;
  const submitBy = notice.kind === "months" ? subtractCalendarMonths(eventDate, notice.count) : subtractWorkingDays(eventDate, notice.count);
  const day = londonDate(today);
  const budgetTotalPence = budgetTotal(answers);
  const ctx: RuleContext = { answers, paid: (costPence ?? 0) > 0, budgetTotalPence };
  return {
    available: true,
    ...choice,
    eventDate,
    submitBy,
    late: day > submitBy,
    workingDaysLeft: workingDaysBetween(day, submitBy),
    notes: config.notes.filter((n) => n.when(ctx)).map((n) => n.text(ctx)),
    checklist: config.checklist.map((rule) => ({
      key: rule.key,
      label: rule.label,
      needed: rule.when(ctx),
      deadline: "submitBy" in rule.due ? submitBy : subtractWorkingDays(eventDate, rule.due.workingDaysBefore),
    })),
    hazards: hazardsFor({ answers, startsAt, endsAt }),
    costLines: answers.costLines,
    budgetTotalPence,
    bankHolidaysKnown: bankHolidaysKnown(eventDate),
  };
}
