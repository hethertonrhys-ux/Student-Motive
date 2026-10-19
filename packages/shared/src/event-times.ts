import { londonInputToIso } from "./time";

// Checks on start and finish times while someone fills in an event form,
// so the problem is pointed out before they tap Save (the database and the
// save functions check again).

export type TimeCheck = { blocked: boolean; message: string; tone: "warning" | "note" };

export const END_BEFORE_START = "The finish time is before the start time. Please fix it.";
export const END_SAME_AS_START = "The finish time is the same as the start time. Pick a later time.";
export const MAX_SOCIAL_HOURS = 12;
export const TOO_LONG_SOCIAL = `That's more than ${MAX_SOCIAL_HOURS} hours. Check the finish time.`;

// Society (committee) events: a start and a finish, each with its own date.
// Returns null while either is incomplete or when the times are fine.
export function checkEventSpan(startsAt: string, endsAt: string): TimeCheck | null {
  const start = londonInputToIso(startsAt);
  const end = londonInputToIso(endsAt);
  if (!start || !end) return null;
  if (end === start) return { blocked: true, message: END_SAME_AS_START, tone: "warning" };
  if (end < start) return { blocked: true, message: END_BEFORE_START, tone: "warning" };
  return null;
}

// Social plans: one date, a start time and an optional finish time. A finish
// earlier than the start means after midnight (22:00 to 02:00), which gets a
// note rather than a warning; the same time as the start, or a plan longer
// than MAX_SOCIAL_HOURS, is blocked.
export function checkSocialTimes(date: string, start: string, finish: string): TimeCheck | null {
  if (!date || !start || !finish) return null;
  const startIso = londonInputToIso(`${date}T${start}`);
  const finishIso = londonInputToIso(`${date}T${finish}`);
  if (!startIso || !finishIso) return null;
  if (finishIso === startIso) return { blocked: true, message: END_SAME_AS_START, tone: "warning" };
  const endMs = finishIso > startIso ? new Date(finishIso).getTime() : new Date(finishIso).getTime() + 24 * 3600e3;
  if (endMs - new Date(startIso).getTime() > MAX_SOCIAL_HOURS * 3600e3) return { blocked: true, message: TOO_LONG_SOCIAL, tone: "warning" };
  if (finishIso < startIso) return { blocked: false, message: `Finishes ${finish} the next morning.`, tone: "note" };
  return null;
}
