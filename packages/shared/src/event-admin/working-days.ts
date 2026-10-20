import { BANK_HOLIDAYS_KNOWN_UNTIL, isBankHoliday } from "./bank-holidays";

// Working days and notice periods, in London calendar dates ('YYYY-MM-DD').
// A working day is Monday to Friday and not an England and Wales bank
// holiday. Bank holidays are listed up to BANK_HOLIDAYS_KNOWN_UNTIL; after
// that only weekends are skipped, and bankHolidaysKnown() says so.

const DAY_MS = 24 * 3600 * 1000;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const londonDay = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });

// The London calendar date of a moment, e.g. "2026-12-31". A date that is
// already 'YYYY-MM-DD' is returned as it is.
export function londonDate(value: string | number | Date): string {
  if (typeof value === "string" && DATE.test(value)) return value;
  const parts = londonDay.formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toUtc(date: string): number {
  const m = DATE.exec(date);
  if (!m) throw new Error(`Not a date: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// The date n days after (or, for negative n, before) a date.
export const addDays = (date: string, n: number) => fromUtc(toUtc(date) + n * DAY_MS);

// 0 = Sunday … 6 = Saturday.
export const dayOfWeek = (date: string) => new Date(toUtc(date)).getUTCDay();

export const isWeekend = (date: string) => dayOfWeek(date) === 0 || dayOfWeek(date) === 6;

// Not a Saturday, Sunday or bank holiday.
export const isWorkingDay = (date: string) => !isWeekend(date) && !isBankHoliday(date);

// False for dates after the bank holiday list ends: those only skip weekends.
export const bankHolidaysKnown = (date: string) => date <= BANK_HOLIDAYS_KNOWN_UNTIL;

// The working day n working days before a date (the date itself doesn't
// count). For an event on Monday 12th, 1 working day before is Friday 9th.
export function subtractWorkingDays(date: string, n: number): string {
  let d = date;
  let left = Math.max(0, Math.floor(n));
  while (left > 0) {
    d = addDays(d, -1);
    if (isWorkingDay(d)) left -= 1;
  }
  return d;
}

// The working day before a date, or the date itself if it is one.
export function onOrBeforeWorkingDay(date: string): string {
  let d = date;
  while (!isWorkingDay(d)) d = addDays(d, -1);
  return d;
}

// How many working days there are from `from` (counted) up to `to` (not
// counted); negative when `to` is before `from`. So
// workingDaysBetween(subtractWorkingDays(x, 10), x) is 10.
export function workingDaysBetween(from: string, to: string): number {
  if (from === to) return 0;
  const sign = from < to ? 1 : -1;
  const [start, end] = sign === 1 ? [from, to] : [to, from];
  let count = 0;
  for (let d = start; d < end; d = addDays(d, 1)) if (isWorkingDay(d)) count += 1;
  return sign * count;
}

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

// n calendar months before a date: the same day number, or the month's last
// day if it's shorter (31 March -> 28 or 29 February). Decision: if that
// isn't a working day, it moves EARLIER to the working day before, so the
// notice is never less than asked for.
export function subtractCalendarMonths(date: string, n: number): string {
  const m = DATE.exec(date);
  if (!m) throw new Error(`Not a date: ${date}`);
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) - Math.floor(n);
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const day = Math.min(Number(m[3]), daysInMonth(year, month));
  return onOrBeforeWorkingDay(fromUtc(Date.UTC(year, month, day)));
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Thu 5 Nov 2026" for a 'YYYY-MM-DD' date (the same on every phone and browser).
export function formatAdminDate(date: string): string {
  const d = new Date(toUtc(date));
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
