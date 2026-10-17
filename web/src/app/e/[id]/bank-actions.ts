"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parsePoundsSum } from "@/lib/ledger";

// Saves a bank table's ledger. Used by the table's bank (on the event page)
// and by the committee (on the Manage page). The database only allows the
// committee or that table's bank to save.

export type BankState = { error?: string; saved?: boolean };
type RowInput = { id?: string; userId?: string | null; name: string; buyins: string; cashout: string; paidOut?: boolean; adjust?: number };

export async function saveBankLedger(eventId: string, tableId: string, _prev: BankState, formData: FormData): Promise<BankState> {
  let input: RowInput[];
  try {
    input = JSON.parse(String(formData.get("rows_json") ?? "[]"));
  } catch {
    return { error: "Couldn't read the table. Please try again." };
  }

  const rows = [];
  for (const r of input) {
    const name = String(r.name ?? "").trim().slice(0, 60);
    if (!name) continue;
    const buyin = parsePoundsSum(String(r.buyins ?? ""));
    if (buyin === null) return { error: `${name}: buy-ins should be amounts like 10 or 10+10.` };
    const cashoutText = String(r.cashout ?? "").trim();
    const cashout = cashoutText === "" ? null : parsePoundsSum(cashoutText);
    if (cashout === undefined || (cashoutText !== "" && cashout === null)) return { error: `${name}: the cash-out should be an amount like 35.` };
    const adjust = Number(r.adjust ?? 0);
    if (!Number.isInteger(adjust) || Math.abs(adjust) > 1000000) return { error: "The split looks wrong. Undo it and try again." };
    rows.push({
      id: typeof r.id === "string" ? r.id : undefined,
      user_id: typeof r.userId === "string" ? r.userId : null,
      player_name: name,
      buyin_pence: buyin,
      cashout_pence: cashout,
      paid_out: cashout !== null && r.paidOut === true,
      adjust_pence: adjust,
      net_pence: (cashout ?? 0) + adjust - buyin,
    });
  }

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase.from("ledger_rows").select("id").eq("event_id", eventId).eq("table_id", tableId);
  if (readError) return { error: "You can't edit this table." };
  const keep = new Set(rows.filter((r) => r.id).map((r) => r.id));
  const remove = (existing ?? []).map((r) => r.id as string).filter((id) => !keep.has(id));
  if (remove.length) await supabase.from("ledger_rows").delete().in("id", remove);

  for (const { id, ...values } of rows) {
    const { error } = id
      ? await supabase.from("ledger_rows").update(values).eq("id", id).eq("event_id", eventId)
      : await supabase.from("ledger_rows").insert({ ...values, event_id: eventId, table_id: tableId });
    if (error) return { error: "Couldn't save. Only the committee or this table's bank can edit it." };
  }

  revalidatePath(`/e/${eventId}`);
  revalidatePath("/dashboard", "layout");
  return { saved: true };
}
