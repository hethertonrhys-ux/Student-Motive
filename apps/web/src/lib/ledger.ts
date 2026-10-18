// Works out "who pays who" at the end of a game.
// Pure maths, no database: easy to test and always gives the same answer.

export type LedgerRow = { id: string; name: string; netPence: number };
export type LedgerPayment = { fromId: string; toId: string; amountPence: number };
export type Transfer = { fromId: string; toId: string; amountPence: number };

export type Settlement = {
  // What each player still needs to pay (negative) or receive (positive).
  balances: Map<string, number>;
  transfers: Transfer[];
  // Results should add up to zero. If not, someone has miscounted.
  imbalancePence: number;
};

export function settle(rows: LedgerRow[], payments: LedgerPayment[]): Settlement {
  const balances = new Map<string, number>(rows.map((r) => [r.id, r.netPence]));
  // A payment already made reduces what the payer owes and what the receiver is due.
  for (const p of payments) {
    if (!balances.has(p.fromId) || !balances.has(p.toId)) continue;
    balances.set(p.fromId, balances.get(p.fromId)! + p.amountPence);
    balances.set(p.toId, balances.get(p.toId)! - p.amountPence);
  }

  const imbalancePence = rows.reduce((sum, r) => sum + r.netPence, 0);
  if (imbalancePence !== 0) return { balances, transfers: [], imbalancePence };

  // Biggest debtor pays biggest creditor until everyone is square.
  // Never needs more than (players - 1) payments.
  const creditors = [...balances].filter(([, b]) => b > 0).map(([id, b]) => ({ id, b })).sort((a, z) => z.b - a.b);
  const debtors = [...balances].filter(([, b]) => b < 0).map(([id, b]) => ({ id, b: -b })).sort((a, z) => z.b - a.b);
  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].b, creditors[j].b);
    transfers.push({ fromId: debtors[i].id, toId: creditors[j].id, amountPence: amount });
    debtors[i].b -= amount;
    creditors[j].b -= amount;
    if (debtors[i].b === 0) i++;
    if (creditors[j].b === 0) j++;
  }
  return { balances, transfers, imbalancePence };
}

export function formatPounds(pence: number, signed = false): string {
  const sign = pence < 0 ? "−" : signed && pence > 0 ? "+" : "";
  const abs = Math.abs(pence);
  const pounds = abs % 100 === 0 ? String(abs / 100) : (abs / 100).toFixed(2);
  return `${sign}£${pounds}`;
}

// "12.50", "-12.5", "£-3", "+4" -> pence. Returns null if it isn't a number.
export function parsePounds(input: string): number | null {
  const cleaned = input.replace(/[£,\s]/g, "").replace("−", "-");
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

// Shares a counting difference evenly so the table adds up to zero.
// e.g. results are £8 over with 8 players -> everyone pays £1 more (−100p each).
// Leftover pennies go to the first few players so the total is exact.
export function splitDifference(playerCount: number, totalPence: number): number[] {
  if (playerCount <= 0) return [];
  const needed = -totalPence;
  const base = Math.trunc(needed / playerCount);
  const leftover = needed - base * playerCount;
  return Array.from({ length: playerCount }, (_, i) => base + (i < Math.abs(leftover) ? Math.sign(leftover) : 0));
}

// "10+10+5" -> 2500 pence (a buy-in plus rebuys). Returns null if invalid.
export function parsePoundsSum(input: string): number | null {
  const parts = input.split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return 0;
  let total = 0;
  for (const part of parts) {
    const pence = parsePounds(part);
    if (pence === null || pence < 0) return null;
    total += pence;
  }
  return total;
}

// ---------- Tables with a bank ----------
// The bank collects every buy-in and pays each player their cash-out.

export type BankRow = { id: string; name: string; buyinPence: number; cashoutPence: number | null; adjustPence: number; paidOut: boolean };

export type BankSummary = {
  takenIn: number; // all buy-ins
  paidOut: number; // cash-outs already handed over
  owed: number; // cash-outs not yet handed over
  inBank: number; // what the bank should be holding right now
  stillPlaying: number; // players with no cash-out yet
  // Once everyone has cashed out: cash-outs minus buy-ins. Should be 0.
  differencePence: number | null;
};

export function payoutOf(row: BankRow): number | null {
  return row.cashoutPence === null ? null : row.cashoutPence + row.adjustPence;
}

export function bankSummary(rows: BankRow[]): BankSummary {
  let takenIn = 0, paidOut = 0, owed = 0, stillPlaying = 0, cashouts = 0;
  for (const r of rows) {
    takenIn += r.buyinPence;
    const payout = payoutOf(r);
    if (payout === null) { stillPlaying++; continue; }
    cashouts += r.cashoutPence!;
    if (r.paidOut) paidOut += payout; else owed += payout;
  }
  return {
    takenIn,
    paidOut,
    owed,
    inBank: takenIn - paidOut,
    stillPlaying,
    differencePence: stillPlaying === 0 && rows.length > 0 ? cashouts - takenIn : null,
  };
}
