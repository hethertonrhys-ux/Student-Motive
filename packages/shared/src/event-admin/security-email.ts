import { formatAdminDate, londonDate } from "./working-days";

// The email to the building's Security reception with the names of an
// event's external speakers and the guests from outside the uni who are
// going. Function drafts it; the committee adds the address, checks it and
// sends it from their own email. Names only, never anyone's email address.

export type SecurityEmailPerson = {
  // The name people see in the app.
  name: string;
  // Their full name, if they've given one (Security checks names against ID).
  fullName?: string | null;
  // Their uni's id ("LSE", "UCL"…); null if we don't know it.
  university: string | null | undefined;
  // Their place on the event ("going", "waitlist"…): only "going" counts.
  status: string;
};

export type SecurityEmailInput = {
  title: string;
  startsAt: string | number | Date;
  endsAt?: string | number | Date | null;
  // The venue as people should find it, e.g. "Marshall Building · Room 1.04".
  venue?: string | null;
  societyName?: string | null;
  speakerNames?: string | null;
  speakerOrg?: string | null;
  people: SecurityEmailPerson[];
  // The society's uni: guests from any other uni (or none we know of) are listed.
  homeUniversity: string;
};

export type SecurityEmailDraft = {
  // Always empty: we don't know the building's Security reception address.
  to: "";
  subject: string;
  body: string;
  // A mailto: link that opens the draft in the phone's or computer's email app.
  url: string;
  // The names listed as guests from outside the uni.
  guests: string[];
};

export const SECURITY_EMAIL_FIRST_LINE = "Add your building's Security reception email above.";

const londonClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const valid = (value: string | number | Date | null | undefined): value is string | number | Date => value != null && !Number.isNaN(new Date(value).getTime());

// "18:30 to 20:30", or "22:00 to 02:00 (Fri 6 Nov 2026)" when it ends on a later day.
function timeRange(startsAt: string | number | Date, endsAt: string | number | Date | null | undefined): string {
  const start = londonClock.format(new Date(startsAt));
  if (!valid(endsAt)) return start;
  const end = londonClock.format(new Date(endsAt));
  const endDay = londonDate(endsAt);
  return endDay > londonDate(startsAt) ? `${start} to ${end} (${formatAdminDate(endDay)})` : `${start} to ${end}`;
}

const clean = (text: string | null | undefined) => String(text ?? "").replace(/\s+/g, " ").trim();

// The names of the people going who aren't from the society's uni (their
// full name if they've given one), in alphabetical order.
export function nonUniGuests(people: SecurityEmailPerson[], homeUniversity: string): string[] {
  return people
    .filter((p) => p.status === "going" && p.university !== homeUniversity)
    .map((p) => clean(p.fullName) || clean(p.name))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "en-GB"));
}

export function securityEmailDraft(input: SecurityEmailInput): SecurityEmailDraft {
  const title = clean(input.title);
  const day = formatAdminDate(londonDate(input.startsAt));
  const subject = `Guest list: ${title}, ${day}`;
  const society = clean(input.societyName);
  const speakers = clean(input.speakerNames);
  const org = clean(input.speakerOrg);
  const venue = clean(input.venue);
  const guests = nonUniGuests(input.people, input.homeUniversity);
  const home = clean(input.homeUniversity);

  const lines: string[] = [
    SECURITY_EMAIL_FIRST_LINE,
    "",
    "Hello,",
    "",
    `Here are the names of the external speakers and non-${home} guests coming to our event, for Security reception.`,
    "",
    `Event: ${title}`,
    ...(society ? [`Society: ${society}`] : []),
    `Date: ${day}`,
    `Time: ${timeRange(input.startsAt, input.endsAt)}`,
    ...(venue ? [`Venue: ${venue}`] : []),
    "",
    `External speaker(s): ${speakers || "none"}`,
    ...(org ? [`Organisation: ${org}`] : []),
    "",
    guests.length ? `Non-${home} guests going (${guests.length}):` : `Non-${home} guests going: none so far.`,
    ...guests,
    "",
    "Many thanks,",
    society ? `${society} committee` : "The committee",
  ];
  const body = lines.join("\r\n");
  const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { to: "", subject, body, url, guests };
}
