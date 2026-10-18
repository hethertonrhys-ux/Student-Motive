// All event times are entered and shown in UK time, whatever timezone
// the server runs in (Vercel servers use UTC).
const TZ = "Europe/London";

function londonParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

// Minutes London is ahead of UTC at a given moment (0 in winter, 60 in summer).
function londonOffsetMs(date: Date) {
  const p = londonParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const truncated = Math.floor(date.getTime() / 60000) * 60000;
  return asUtc - truncated;
}

// "2026-10-20T19:00" (UK time, from a datetime-local input) -> ISO string.
export function londonInputToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let ts = guess - londonOffsetMs(new Date(guess));
  const check = guess - londonOffsetMs(new Date(ts));
  if (check !== ts) ts = check;
  return new Date(ts).toISOString();
}

// ISO string -> "2026-10-20T19:00" in UK time, for datetime-local inputs.
export function isoToLondonInput(iso: string): string {
  const p = londonParts(new Date(iso));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// "Tue 20 Oct, 19:00–22:00" (or across days: "Fri 23 Oct, 22:00 – Sat 24 Oct, 03:00")
export function formatEventTime(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startDay = dayFormat.format(start);
  const endDay = dayFormat.format(end);
  const sameDay = startDay === endDay;
  // Nights out that finish before 6am count as the same night.
  const overnight = !sameDay && end.getTime() - start.getTime() < 12 * 3600 * 1000 && londonParts(end).hour < 6;
  if (sameDay || overnight) {
    return `${startDay}, ${timeFormat.format(start)}–${timeFormat.format(end)}`;
  }
  return `${startDay}, ${timeFormat.format(start)} – ${endDay}, ${timeFormat.format(end)}`;
}

export function isLive(startIso: string, endIso: string, now = Date.now()) {
  return new Date(startIso).getTime() <= now && now < new Date(endIso).getTime();
}

export function hasEnded(endIso: string, now = Date.now()) {
  return new Date(endIso).getTime() < now;
}

// The current time. Pages render on every request, so this is always fresh.
export function nowMs() {
  return Date.now();
}

// The next 6am in London after `now`. "Tonight" runs until then.
export function nextLondonSixAm(now = Date.now(), extraDays = 0): string {
  const p = londonParts(new Date(now));
  const addDays = (p.hour >= 6 ? 1 : 0) + extraDays;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + addDays));
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T06:00`;
  return londonInputToIso(local)!;
}
