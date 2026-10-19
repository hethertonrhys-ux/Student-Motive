import type { SupabaseClient } from "@supabase/supabase-js";
import { getEventPeople, getLedger, type LedgerPaymentRecord, type LedgerRowRecord, type Person } from "./event-people";
import { parsePoundsSum } from "./ledger";
import { promptCount } from "./my-prompts";
import type { EventFormat, EventTable } from "./types";

// Taking part in a society event: the reads and the taps. The database
// functions check membership, limits and free seats, so these stay simple.
// Their error messages are written for people, so they're shown as they are.

export type Result = { error?: string };

function friendly(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/log in/i.test(message)) return "Log in first.";
  return message;
}
const done = ({ error }: { error: { message: string } | null }): Result => (error ? { error: friendly(error.message) } : {});

export const joinEvent = async (supabase: SupabaseClient, eventId: string, tableId: string | null): Promise<Result> => done(await supabase.rpc("join_event", { eid: eventId, tid: tableId }));
export const chooseTable = async (supabase: SupabaseClient, eventId: string, tableId: string | null): Promise<Result> => done(await supabase.rpc("choose_table", { eid: eventId, tid: tableId }));
export const leaveEvent = async (supabase: SupabaseClient, eventId: string): Promise<Result> => done(await supabase.rpc("leave_event", { eid: eventId }));
export const setAlsoTables = async (supabase: SupabaseClient, eventId: string, tableIds: string[]): Promise<Result> => done(await supabase.rpc("set_also_tables", { eid: eventId, tids: tableIds }));
export const joinTableWaitlist = async (supabase: SupabaseClient, eventId: string, tableId: string): Promise<Result> => done(await supabase.rpc("join_table_waitlist", { eid: eventId, tid: tableId }));
export const leaveTableWaitlist = async (supabase: SupabaseClient, eventId: string): Promise<Result> => done(await supabase.rpc("leave_table_waitlist", { eid: eventId }));
export const confirmSeat = async (supabase: SupabaseClient, eventId: string): Promise<Result> => done(await supabase.rpc("confirm_seat", { eid: eventId }));
// A chosen seat (seat number) or, with null, any empty seat at the table. Joins the event if needed.
export const takeSeat = async (supabase: SupabaseClient, eventId: string, tableId: string, seat: number | null): Promise<Result> => done(await supabase.rpc("take_seat", { eid: eventId, tid: tableId, seat }));
// The event's group chat (only people who may use it get an id back) and
// who counts as its host (the student hosting, or the society's committee).
export async function loadEventChat(supabase: SupabaseClient, eventId: string): Promise<string | null> {
  const { data } = await supabase.from("threads").select("id").eq("event_id", eventId).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
export async function loadEventHosts(supabase: SupabaseClient, eventId: string): Promise<Set<string>> {
  const { data } = await supabase.rpc("event_hosts", { eid: eventId });
  return new Set(((data ?? []) as (string | { event_hosts: string })[]).map((x) => (typeof x === "string" ? x : x.event_hosts)));
}
// Committee: reshuffle everyone at a table; each player is told their new seat.
export const randomiseSeats = async (supabase: SupabaseClient, eventId: string, tableId: string): Promise<Result> => done(await supabase.rpc("randomise_table_seats", { eid: eventId, tid: tableId }));

// Reporting your own result (e.g. leaving early) and settle-ups with tablemates.
export const recordMyResult = async (supabase: SupabaseClient, eventId: string, netPence: number): Promise<Result> => done(await supabase.rpc("record_my_result", { eid: eventId, net_pence: netPence }));
export const recordMyPayment = async (supabase: SupabaseClient, eventId: string, otherUser: string, amountPence: number, iPaid: boolean): Promise<Result> => done(await supabase.rpc("record_my_payment", { eid: eventId, other_user: otherUser, amount_pence: amountPence, i_paid: iPaid }));
export const deleteMyPayment = async (supabase: SupabaseClient, paymentId: string): Promise<Result> => done(await supabase.rpc("delete_my_payment", { pid: paymentId }));

// After results are shared: mark one of your "who pays who" payments as paid, or undo a mark you made.
export const markPaymentPaid = async (supabase: SupabaseClient, eventId: string, fromRow: string, toRow: string, amountPence: number): Promise<Result> => done(await supabase.rpc("mark_payment_paid", { eid: eventId, from_row: fromRow, to_row: toRow, amount_pence: amountPence }));
export const undoPaymentMark = async (supabase: SupabaseClient, paymentId: string): Promise<Result> => done(await supabase.rpc("undo_payment_mark", { pid: paymentId }));

// The name other members see (asked for before the first join).
export async function saveName(supabase: SupabaseClient, userId: string, input: string): Promise<Result> {
  const name = input.trim().replace(/\s+/g, " ").slice(0, 60);
  if (name.length < 2) return { error: "Enter your name." };
  const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", userId);
  return error ? { error: "Couldn't save your name. Please try again." } : {};
}

// ---- Everything the event page needs about you and the others ----

// Waiting lists for full tables: how many are waiting, and your place (0 if not queued).
export type Queue = Map<string, { waiting: number; myPosition: number }>;

export type Participation = {
  isMember: boolean;
  people: Person[];
  tables: EventTable[];
  queue: Queue;
  prompts: number;
  ledger: { rows: LedgerRowRecord[]; payments: LedgerPaymentRecord[] };
};

export async function loadParticipation(supabase: SupabaseClient, eventId: string, societyId: string | null, format: EventFormat, userId: string): Promise<Participation> {
  const [member, { people, tables }, { data: queueRows }, prompts, ledger] = await Promise.all([
    societyId ? supabase.rpc("is_society_member", { sid: societyId }).then((r) => r.data === true) : Promise.resolve(false),
    getEventPeople(supabase, eventId),
    format === "tables" ? supabase.rpc("table_waitlist_summary", { eid: eventId }) : Promise.resolve({ data: [] }),
    promptCount(supabase, userId),
    getLedger(supabase, eventId),
  ]);
  const queue: Queue = new Map(((queueRows ?? []) as { table_id: string; waiting: number; my_position: number }[]).map((q) => [q.table_id, { waiting: Number(q.waiting), myPosition: Number(q.my_position) }]));
  return { isMember: member, people, tables, queue, prompts, ledger };
}

// ---- The bank's table ----

export type BankEditorRow = {
  key: string;
  id?: string;
  userId?: string | null;
  name: string;
  buyins: string; // e.g. "10+10"
  cashout: string; // blank = still playing
  paidOut: boolean;
  adjust: number;
};

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

// Saves a bank table's ledger. The database only allows the committee or
// that table's bank to save.
export async function saveBankLedger(supabase: SupabaseClient, eventId: string, tableId: string, input: BankEditorRow[]): Promise<Result> {
  const rows = [];
  for (const r of input) {
    const name = String(r.name ?? "").trim().slice(0, 60);
    if (!name) continue;
    const buyin = parsePoundsSum(String(r.buyins ?? ""));
    if (buyin === null) return { error: `${name}: buy-ins should be amounts like 10 or 10+10.` };
    const cashoutText = String(r.cashout ?? "").trim();
    const cashout = cashoutText === "" ? null : parsePoundsSum(cashoutText);
    if (cashoutText !== "" && cashout === null) return { error: `${name}: the cash-out should be an amount like 35.` };
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
  return {};
}
