"use server";

import { revalidatePath } from "next/cache";
import { requireManagedSociety } from "@/lib/society";
import { parsePounds } from "@/lib/ledger";

// Every action checks the user runs this society; the database checks again.

function refresh(societyId: string, eventId: string) {
  revalidatePath(`/dashboard/${societyId}/events/${eventId}`);
  revalidatePath(`/e/${eventId}`);
}

async function managed(societyId: string, eventId: string) {
  const { supabase } = await requireManagedSociety(societyId);
  const { data: event } = await supabase.from("events").select("id").eq("id", eventId).eq("society_id", societyId).maybeSingle();
  if (!event) throw new Error("Event not found");
  return supabase;
}

// ---------- People ----------

export async function removeEntry(societyId: string, eventId: string, userId: string) {
  const supabase = await managed(societyId, eventId);
  await supabase.from("event_entries").delete().eq("event_id", eventId).eq("user_id", userId);
  refresh(societyId, eventId);
}

export async function promoteEntry(societyId: string, eventId: string, userId: string) {
  const supabase = await managed(societyId, eventId);
  await supabase.from("event_entries").update({ status: "going" }).eq("event_id", eventId).eq("user_id", userId);
  refresh(societyId, eventId);
}

export async function moveEntry(societyId: string, eventId: string, userId: string, formData: FormData) {
  const supabase = await managed(societyId, eventId);
  const tableId = String(formData.get("table_id") ?? "") || null;
  await supabase.from("event_entries").update({ table_id: tableId }).eq("event_id", eventId).eq("user_id", userId);
  refresh(societyId, eventId);
}

export async function savePositions(societyId: string, eventId: string, formData: FormData) {
  const supabase = await managed(societyId, eventId);
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("pos_")) continue;
    const userId = key.slice(4);
    const n = Number(String(value).trim());
    const position = String(value).trim() === "" ? null : Number.isInteger(n) && n > 0 ? n : undefined;
    if (position === undefined) continue;
    await supabase.from("event_entries").update({ finish_position: position }).eq("event_id", eventId).eq("user_id", userId);
  }
  refresh(societyId, eventId);
}

// ---------- Ledger ----------

export type LedgerState = { error?: string; saved?: boolean };

type RowInput = { id?: string; userId?: string | null; name: string; amount: string };

export async function saveLedger(
  societyId: string,
  eventId: string,
  tableId: string | null,
  _prev: LedgerState,
  formData: FormData,
): Promise<LedgerState> {
  const supabase = await managed(societyId, eventId);

  let input: RowInput[];
  try {
    input = JSON.parse(String(formData.get("rows_json") ?? "[]"));
  } catch {
    return { error: "Couldn't read the results. Please try again." };
  }

  const rows = [];
  for (const r of input) {
    const name = String(r.name ?? "").trim().slice(0, 60);
    if (!name) continue;
    const pence = String(r.amount ?? "").trim() === "" ? 0 : parsePounds(String(r.amount));
    if (pence === null) return { error: `${name}: "${r.amount}" isn't an amount. Use numbers like 12.50 or -8.` };
    rows.push({
      id: typeof r.id === "string" ? r.id : undefined,
      user_id: typeof r.userId === "string" ? r.userId : null,
      player_name: name,
      net_pence: pence,
    });
  }

  let existingQuery = supabase.from("ledger_rows").select("id").eq("event_id", eventId);
  existingQuery = tableId ? existingQuery.eq("table_id", tableId) : existingQuery.is("table_id", null);
  const { data: existing } = await existingQuery;
  const keep = new Set(rows.filter((r) => r.id).map((r) => r.id));
  const remove = (existing ?? []).map((r) => r.id as string).filter((id) => !keep.has(id));
  if (remove.length) await supabase.from("ledger_rows").delete().in("id", remove);

  for (const r of rows) {
    const values = { player_name: r.player_name, net_pence: r.net_pence, user_id: r.user_id };
    const { error } = r.id
      ? await supabase.from("ledger_rows").update(values).eq("id", r.id).eq("event_id", eventId)
      : await supabase.from("ledger_rows").insert({ ...values, event_id: eventId, table_id: tableId });
    if (error) return { error: "Couldn't save the results. Please try again." };
  }

  refresh(societyId, eventId);
  return { saved: true };
}

export async function addPayment(societyId: string, eventId: string, _prev: LedgerState, formData: FormData): Promise<LedgerState> {
  const supabase = await managed(societyId, eventId);
  const from = String(formData.get("from_row") ?? "");
  const to = String(formData.get("to_row") ?? "");
  const pence = parsePounds(String(formData.get("amount") ?? ""));
  if (!from || !to) return { error: "Choose who paid and who they paid." };
  if (from === to) return { error: "Choose two different players." };
  if (pence === null || pence <= 0) return { error: "Enter the amount they paid, e.g. 12.50." };

  const { error } = await supabase.from("ledger_payments").insert({ event_id: eventId, from_row: from, to_row: to, amount_pence: pence });
  if (error) return { error: "Couldn't save that payment. Please try again." };
  refresh(societyId, eventId);
  return { saved: true };
}

export async function deletePayment(societyId: string, eventId: string, paymentId: string) {
  const supabase = await managed(societyId, eventId);
  await supabase.from("ledger_payments").delete().eq("id", paymentId).eq("event_id", eventId);
  refresh(societyId, eventId);
}

export async function setResultsPublished(societyId: string, eventId: string, published: boolean) {
  const supabase = await managed(societyId, eventId);
  await supabase.from("events").update({ results_published: published }).eq("id", eventId);
  refresh(societyId, eventId);
}
