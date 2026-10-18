"use server";

import { revalidatePath } from "next/cache";
import { getUserId, requireProfile } from "@/lib/auth";
import { getCards } from "@/lib/social";
import { createClient } from "@/lib/supabase/server";

export type ChatMessage = {
  id: string;
  body: string;
  created_at: string;
  sender_id: string | null;
  sender_name: string;
  sender_avatar: string | null;
  deleted: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Messages in a chat, optionally only those after a time (for live updates).
export async function fetchMessages(threadId: string, after: string | null): Promise<ChatMessage[]> {
  await requireProfile();
  if (!UUID.test(threadId)) return [];
  const supabase = await createClient();
  let query = supabase
    .from("messages")
    .select("id, body, created_at, sender_id, deleted_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (after) query = query.gt("created_at", after);
  const { data } = await query;
  const rows = (data ?? []).reverse() as { id: string; body: string; created_at: string; sender_id: string | null; deleted_at: string | null }[];
  const cards = await getCards(supabase, rows.map((r) => r.sender_id).filter((x): x is string => !!x));
  await supabase.rpc("mark_thread_read", { tid: threadId });
  return rows.map((r) => ({
    id: r.id,
    body: r.deleted_at ? "" : r.body,
    created_at: r.created_at,
    sender_id: r.sender_id,
    sender_name: (r.sender_id && cards.get(r.sender_id)?.name) || "Former member",
    sender_avatar: (r.sender_id && cards.get(r.sender_id)?.avatar_url) || null,
    deleted: Boolean(r.deleted_at),
  }));
}

export async function sendMessage(threadId: string, body: string): Promise<{ error?: string }> {
  await requireProfile();
  const text = body.trim();
  if (!text) return {};
  if (text.length > 2000) return { error: "That message is too long." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_message", { tid: threadId, body: text });
  return error ? { error: error.message.replace(/^.*?: /, "") || "Couldn't send. Try again." } : {};
}

export async function deleteMessage(messageId: string) {
  await requireProfile();
  const supabase = await createClient();
  await supabase.rpc("delete_message", { mid: messageId });
}

export async function reportMessage(messageId: string, reason: string): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("reports").insert({ message_id: messageId, reason: reason.slice(0, 200) || "Reported message" });
  return error ? { error: "Couldn't send the report. Try again." } : {};
}

// How many unread messages you have across all chats (for the bottom bar).
export async function getUnreadCount(): Promise<number> {
  if (!(await getUserId())) return 0;
  const supabase = await createClient();
  const { data } = await supabase.rpc("unread_message_count");
  return Number(data ?? 0);
}

// Opening a chat: mark it read and return the new unread total, so the badge
// clears straight away. The Messages list is refreshed too.
export async function markThreadRead(threadId: string): Promise<number> {
  if (!UUID.test(threadId) || !(await getUserId())) return 0;
  const supabase = await createClient();
  await supabase.rpc("mark_thread_read", { tid: threadId });
  const { data } = await supabase.rpc("unread_message_count");
  revalidatePath("/chats");
  return Number(data ?? 0);
}
