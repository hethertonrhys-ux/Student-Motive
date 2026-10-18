"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parsePounds } from "@/lib/ledger";

export type JoinResult = { error?: string };

// The database functions check membership, limits and free seats, so these
// stay simple. Their error messages are written for people, so we show them.
function friendly(message: string | undefined) {
  if (!message) return "Something went wrong. Please try again.";
  if (/log in/i.test(message)) return "Log in first.";
  return message;
}

export async function joinEvent(eventId: string, tableId: string | null): Promise<JoinResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_event", { eid: eventId, tid: tableId });
  revalidatePath(`/e/${eventId}`);
  return error ? { error: friendly(error.message) } : {};
}

export async function chooseTable(eventId: string, tableId: string | null): Promise<JoinResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("choose_table", { eid: eventId, tid: tableId });
  revalidatePath(`/e/${eventId}`);
  return error ? { error: friendly(error.message) } : {};
}

export async function leaveEvent(eventId: string): Promise<JoinResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_event", { eid: eventId });
  revalidatePath(`/e/${eventId}`);
  return error ? { error: friendly(error.message) } : {};
}

export async function setAlsoTables(eventId: string, tableIds: string[]): Promise<JoinResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_also_tables", { eid: eventId, tids: tableIds });
  revalidatePath(`/e/${eventId}`);
  return error ? { error: friendly(error.message) } : {};
}

// ---------- Reporting your own result (e.g. leaving early) ----------

export type ReportState = { error?: string; saved?: boolean };

export async function recordMyResult(eventId: string, _prev: ReportState, formData: FormData): Promise<ReportState> {
  const pence = parsePounds(String(formData.get("amount") ?? ""));
  if (pence === null) return { error: "Enter an amount, e.g. 12.50." };
  const direction = formData.get("direction") === "down" ? -1 : 1;
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_my_result", { eid: eventId, net_pence: Math.abs(pence) * direction });
  revalidatePath(`/e/${eventId}`);
  return error ? { error: friendly(error.message) } : { saved: true };
}

export async function recordMyPayment(eventId: string, _prev: ReportState, formData: FormData): Promise<ReportState> {
  const pence = parsePounds(String(formData.get("amount") ?? ""));
  const other = String(formData.get("other_user") ?? "");
  if (!other) return { error: "Choose the player." };
  if (pence === null || pence <= 0) return { error: "Enter an amount, e.g. 12.50." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_my_payment", {
    eid: eventId,
    other_user: other,
    amount_pence: pence,
    i_paid: formData.get("direction") === "paid",
  });
  revalidatePath(`/e/${eventId}`);
  return error ? { error: friendly(error.message) } : { saved: true };
}

export async function deleteMyPayment(eventId: string, paymentId: string): Promise<JoinResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_my_payment", { pid: paymentId });
  revalidatePath(`/e/${eventId}`);
  return error ? { error: friendly(error.message) } : {};
}

// Confirming your seat saves it as confirmed and takes you to your dashboard.
export async function confirmSeat(eventId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_seat", { eid: eventId });
  if (error) return;
  revalidatePath(`/e/${eventId}`);
  redirect(`/dashboard?confirmed=${eventId}`);
}

// Waiting list for a full table (before the event starts).
export async function joinTableWaitlist(eventId: string, tableId: string): Promise<JoinResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_table_waitlist", { eid: eventId, tid: tableId });
  revalidatePath(`/e/${eventId}`);
  return error ? { error: friendly(error.message) } : {};
}

export async function leaveTableWaitlist(eventId: string): Promise<JoinResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_table_waitlist", { eid: eventId });
  revalidatePath(`/e/${eventId}`);
  return error ? { error: friendly(error.message) } : {};
}
