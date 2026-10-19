import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntryStatus, EventTable } from "./types";

export type Person = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  status: EntryStatus;
  tableId: string | null;
  finishPosition: number | null;
  joinedAt: string;
  alsoTables: string[];
  confirmedTableId: string | null;
  country: string | null;
};

// Everyone who's joined an event, with their names. The database decides what
// the logged-in user may see (members and the committee see everyone).
export async function getEventPeople(supabase: SupabaseClient, eventId: string) {
  const [{ data: entries }, { data: tables }] = await Promise.all([
    supabase
      .from("event_entries")
      .select("user_id, status, table_id, finish_position, created_at, also_tables, confirmed_table_id")
      .eq("event_id", eventId)
      .order("created_at"),
    supabase.from("event_tables").select("*").eq("event_id", eventId).order("position"),
  ]);

  const ids = (entries ?? []).map((e) => e.user_id as string);
  const { data: cards } = ids.length
    ? await supabase.from("profile_cards").select("id, name, avatar_url, country").in("id", ids)
    : { data: [] };
  const byId = new Map((cards ?? []).map((c) => [c.id as string, c]));

  const people: Person[] = (entries ?? []).map((e) => ({
    userId: e.user_id,
    name: (byId.get(e.user_id)?.name as string) ?? "Member",
    avatarUrl: (byId.get(e.user_id)?.avatar_url as string | null) ?? null,
    status: e.status,
    tableId: e.table_id,
    finishPosition: e.finish_position,
    joinedAt: e.created_at,
    alsoTables: (e.also_tables as string[] | null) ?? [],
    confirmedTableId: (e.confirmed_table_id as string | null) ?? null,
    country: (byId.get(e.user_id)?.country as string | null) ?? null,
  }));

  return { people, tables: (tables ?? []) as EventTable[] };
}

export type LedgerRowRecord = {
  id: string;
  table_id: string | null;
  user_id: string | null;
  player_name: string;
  net_pence: number;
  adjust_pence: number;
  created_by: string | null;
  buyin_pence: number;
  cashout_pence: number | null;
  paid_out: boolean;
};
export type LedgerPaymentRecord = { id: string; from_row: string; to_row: string; amount_pence: number; created_by: string | null };

export async function getLedger(supabase: SupabaseClient, eventId: string) {
  const [{ data: rows }, { data: payments }] = await Promise.all([
    supabase.from("ledger_rows").select("id, table_id, user_id, player_name, net_pence, adjust_pence, created_by, buyin_pence, cashout_pence, paid_out").eq("event_id", eventId).order("created_at"),
    supabase.from("ledger_payments").select("id, from_row, to_row, amount_pence, created_by").eq("event_id", eventId).order("created_at"),
  ]);
  return { rows: (rows ?? []) as LedgerRowRecord[], payments: (payments ?? []) as LedgerPaymentRecord[] };
}
