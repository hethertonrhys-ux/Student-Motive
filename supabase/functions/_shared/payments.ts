// Money for paid Social plans: one place for the sums, used by the Stripe
// functions (Deno) and the app (through packages/shared/src/payments.ts),
// so what people see is what they're charged. No imports, on purpose.
//
// All amounts are in pence.

// Stripe's fee for a standard UK card: 1.5% + 20p (stripe.com/gb/pricing).
// European cards cost a little more (2.5% + 20p); this uses the UK rate.
export const STRIPE_PERCENT = 0.015;
export const STRIPE_FIXED_PENCE = 20;

// Function's own platform fee on each payment. 0 for now: set a number of
// pence here to start taking one (it's added to the service fee, or taken
// from the host's share when the host absorbs the fee).
export const FUNCTION_FEE_PENCE = 0;

// Hosts are paid out this long after a plan ends (refunds and disputes are
// easier while the money is still in their Stripe balance).
export const PAYOUT_HOLD_HOURS = 48;

export type FeeMode = "added" | "absorbed";

export type Charge = {
  // What the payer pays.
  amount: number;
  // Their share of the total cost.
  share: number;
  // The service fee shown to the payer (0 when the host absorbs it).
  fee: number;
  // What Function keeps (Stripe's fee plus any Function fee). The host gets amount - appFee.
  appFee: number;
  // What the host gets for this payment.
  toHost: number;
};

// Each person's share: the total split across every space (the host is one
// of them), rounded up to the penny.
export function sharePerPerson(totalPence: number, spaces: number): number {
  if (!(totalPence > 0) || !(spaces >= 1)) return 0;
  return Math.ceil(totalPence / spaces);
}

// Stripe's fee on a payment of this amount (rounded up).
export function stripeFee(amountPence: number): number {
  return Math.ceil(amountPence * STRIPE_PERCENT + STRIPE_FIXED_PENCE);
}

// What someone pays for a share, and where it goes.
// "added": the fee is added on top, so the host gets the whole share.
// "absorbed": they pay the share; the fee comes out of what the host gets.
export function chargeFor(share: number, mode: FeeMode): Charge {
  if (mode === "absorbed") {
    const appFee = stripeFee(share) + FUNCTION_FEE_PENCE;
    return { amount: share, share, fee: 0, appFee, toHost: share - appFee };
  }
  // The smallest amount that leaves the share after Stripe's fee and Function's fee.
  let amount = Math.ceil((share + STRIPE_FIXED_PENCE + FUNCTION_FEE_PENCE) / (1 - STRIPE_PERCENT));
  while (amount - stripeFee(amount) - FUNCTION_FEE_PENCE < share) amount += 1;
  const fee = amount - share;
  return { amount, share, fee, appFee: fee, toHost: share };
}

// "£8.00", "£12.50".
export function pounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

// A fee: "33p" under a pound, "£1.05" from a pound up.
export function feeText(pence: number): string {
  return pence < 100 ? `${pence}p` : pounds(pence);
}

// The end of what shows on the payer's bank statement after "FUNCTION* ",
// from the plan's title: capitals, letters and numbers, at most 12
// characters (Stripe allows 22 in all), e.g. "POWERLEAGUE".
export function statementSuffix(title: string): string {
  const cleaned = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let suffix = "";
  for (const word of cleaned.split(" ")) {
    const next = suffix ? `${suffix} ${word}` : word;
    if (next.length > 12) break;
    suffix = next;
  }
  if (!suffix) suffix = cleaned.slice(0, 12).trim();
  return /[A-Z]/.test(suffix) ? suffix : "PLAN";
}
