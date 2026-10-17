"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
