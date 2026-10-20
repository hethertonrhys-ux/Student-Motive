import type { ChecklistKey, EventAdminAnswers, EventAdminForm } from "./types";

// LSESU's event rules, in one place so they're easy to change. Function
// prepares the paperwork from these; the committee checks it and submits
// it to LSESU themselves.

export type Notice = { kind: "working_days" | "months"; count: number; label: string };

// What the rules know about an event.
export type RuleContext = {
  answers: EventAdminAnswers;
  // The event costs money to attend (its ticket price is over £0).
  paid: boolean;
  // The larger of the budget typed in and the cost lines' total.
  budgetTotalPence: number;
};

export type NoteRule = { key: string; when: (ctx: RuleContext) => boolean; text: (ctx: RuleContext) => string };

export type ChecklistRule = {
  key: ChecklistKey;
  label: string;
  when: (ctx: RuleContext) => boolean;
  // Due by the form's submit-by date, or a number of working days before the event.
  due: { submitBy: true } | { workingDaysBefore: number };
};

export type UniEventAdminConfig = {
  university: string;
  su: string;
  // Any one of these makes it a large event.
  large: { attendeesOver: number; budgetOverPence: number };
  forms: Record<EventAdminForm, { name: string; notice: Notice }>;
  notes: NoteRule[];
  checklist: ChecklistRule[];
};

const always = () => true;

export const LSE_EVENT_ADMIN: UniEventAdminConfig = {
  university: "LSE",
  su: "LSESU",
  // Large / External Speaker Event Form: an external speaker or organisation,
  // more than 75 people, alcohol as the focus, or a budget over £500.
  large: { attendeesOver: 75, budgetOverPence: 50000 },
  forms: {
    regular: { name: "Regular Event Form", notice: { kind: "working_days", count: 10, label: "10 working days" } },
    large: { name: "Large / External Speaker Event Form", notice: { kind: "months", count: 1, label: "1 month" } },
    // Decision: LSESU's guidance gives no notice period for trips, so this
    // uses the safer 1 month. Change it here if LSESU says otherwise.
    trip: { name: "Trip Form", notice: { kind: "months", count: 1, label: "1 month" } },
  },
  // Shown as plain lines: the always-on ones, then those that apply.
  notes: [
    {
      key: "podio",
      when: always,
      text: (ctx) => (ctx.budgetTotalPence > 0 ? "Your committee submits the form on Podio, with a risk assessment and a budget." : "Your committee submits the form on Podio, with a risk assessment."),
    },
    { key: "approval", when: always, text: () => "Events must be approved by LSESU before they're promoted." },
    { key: "reply", when: always, text: () => "LSESU aims to reply within 5 working days." },
    { key: "native", when: (ctx) => ctx.paid, text: () => "Paid tickets: Native is LSESU's only approved ticketing platform." },
    { key: "guests_tickets", when: (ctx) => ctx.answers.nonLseGuests, text: () => "Non-LSE guests are coming, so the event needs tickets on Native." },
    { key: "chair", when: (ctx) => ctx.answers.externalSpeaker && ctx.answers.openToPublic, text: () => "External speakers at an event open to the public need an LSE academic to chair it." },
    {
      key: "security",
      when: (ctx) => ctx.answers.externalSpeaker || ctx.answers.nonLseGuests,
      text: () => "Email the names of speakers and non-LSE guests to the building's Security reception by the day before the event at the latest.",
    },
  ],
  checklist: [
    { key: "form_submitted", label: "Form submitted on Podio", when: always, due: { submitBy: true } },
    // Decision: 2 working days before the event, so there's time to promote it.
    { key: "su_approved", label: "SU approved", when: always, due: { workingDaysBefore: 2 } },
    { key: "room_confirmed", label: "Room confirmed", when: (ctx) => ctx.answers.venueType === "campus", due: { workingDaysBefore: 5 } },
    { key: "academic_chair", label: "Academic chair secured", when: (ctx) => ctx.answers.externalSpeaker && ctx.answers.openToPublic, due: { workingDaysBefore: 10 } },
    { key: "native_tickets", label: "Native tickets set up", when: (ctx) => ctx.paid || ctx.answers.nonLseGuests, due: { workingDaysBefore: 5 } },
    { key: "security_list", label: "Security guest list sent", when: (ctx) => ctx.answers.externalSpeaker || ctx.answers.nonLseGuests, due: { workingDaysBefore: 1 } },
  ],
};
