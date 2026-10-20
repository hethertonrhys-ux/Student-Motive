// Bank holidays in England and Wales, which aren't working days (LSESU's
// notice periods count working days). From gov.uk/bank-holidays.
//
// The list runs to the end of BANK_HOLIDAYS_KNOWN_UNTIL. Dates after that
// fall back to "weekends only" (see working-days.ts) and are flagged, so
// extend this list (and the date) from gov.uk/bank-holidays each year.
export const BANK_HOLIDAYS_KNOWN_UNTIL = "2028-12-31";

export const ENGLAND_AND_WALES_BANK_HOLIDAYS: readonly string[] = [
  // 2026
  "2026-01-01", // New Year's Day
  "2026-04-03", // Good Friday
  "2026-04-06", // Easter Monday
  "2026-05-04", // Early May bank holiday
  "2026-05-25", // Spring bank holiday
  "2026-08-31", // Summer bank holiday
  "2026-12-25", // Christmas Day
  "2026-12-28", // Boxing Day (substitute day)
  // 2027
  "2027-01-01", // New Year's Day
  "2027-03-26", // Good Friday
  "2027-03-29", // Easter Monday
  "2027-05-03", // Early May bank holiday
  "2027-05-31", // Spring bank holiday
  "2027-08-30", // Summer bank holiday
  "2027-12-27", // Christmas Day (substitute day)
  "2027-12-28", // Boxing Day (substitute day)
  // 2028
  "2028-01-03", // New Year's Day (substitute day)
  "2028-04-14", // Good Friday
  "2028-04-17", // Easter Monday
  "2028-05-01", // Early May bank holiday
  "2028-05-29", // Spring bank holiday
  "2028-08-28", // Summer bank holiday
  "2028-12-25", // Christmas Day
  "2028-12-26", // Boxing Day
];

const HOLIDAYS = new Set(ENGLAND_AND_WALES_BANK_HOLIDAYS);

// Is this date ('YYYY-MM-DD') a bank holiday in England and Wales?
export const isBankHoliday = (date: string) => HOLIDAYS.has(date);
