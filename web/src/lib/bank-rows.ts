import type { BankEditorRow } from "@/app/e/[id]/bank-ledger";
import type { LedgerRowRecord, Person } from "@/lib/event-people";

const pounds = (pence: number) => (pence / 100).toFixed(2).replace(/\.00$/, "");

// A bank table's saved lines, plus anyone seated there who isn't in them yet.
export function bankEditorRows(saved: LedgerRowRecord[], seated: Person[]): BankEditorRow[] {
  const rows: BankEditorRow[] = saved.map((r) => ({
    key: r.id,
    id: r.id,
    userId: r.user_id,
    name: r.player_name,
    buyins: r.buyin_pence ? pounds(r.buyin_pence) : "",
    cashout: r.cashout_pence === null ? "" : pounds(r.cashout_pence),
    paidOut: r.paid_out,
    adjust: r.adjust_pence,
  }));
  const savedUsers = new Set(saved.map((r) => r.user_id).filter(Boolean));
  for (const p of seated) {
    if (!savedUsers.has(p.userId)) rows.push({ key: `user-${p.userId}`, userId: p.userId, name: p.name, buyins: "", cashout: "", paidOut: false, adjust: 0 });
  }
  return rows;
}
