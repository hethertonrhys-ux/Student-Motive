"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getFriendships, getHiddenPeople, relationFor, type PersonCard, type Relation } from "@/lib/social";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const friendly = (message: string | undefined) => message?.replace(/^.*?: /, "") || "Something went wrong. Try again.";

function refresh(id: string) {
  revalidatePath("/friends");
  revalidatePath(`/u/${id}`);
}

export async function sendFriendRequest(id: string): Promise<{ error?: string; result?: string }> {
  await requireProfile();
  if (!UUID.test(id)) return { error: "Person not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_friend_request", { target: id });
  if (error) return { error: friendly(error.message) };
  refresh(id);
  return { result: String(data) };
}

export async function respondToRequest(id: string, accept: boolean) {
  await requireProfile();
  const supabase = await createClient();
  await supabase.rpc("respond_friend_request", { from_user: id, accept });
  refresh(id);
}

// Unfriend, or cancel a request you sent.
export async function removeFriend(id: string) {
  await requireProfile();
  const supabase = await createClient();
  await supabase.rpc("remove_friend", { other: id });
  refresh(id);
}

export async function blockUser(id: string) {
  await requireProfile();
  const supabase = await createClient();
  await supabase.rpc("block_user", { target: id });
  refresh(id);
  revalidatePath("/chats");
  redirect("/friends?blocked=1");
}

export async function unblockUser(id: string) {
  const me = await requireProfile();
  const supabase = await createClient();
  await supabase.from("user_blocks").delete().eq("blocker_id", me.id).eq("blocked_id", id);
  refresh(id);
}

export type ReportState = { error?: string; sent?: boolean };

export async function reportUser(id: string, _prev: ReportState, formData: FormData): Promise<ReportState> {
  await requireProfile();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);
  const details = String(formData.get("details") ?? "").trim().slice(0, 2000) || null;
  if (!reason) return { error: "Choose a reason." };
  const supabase = await createClient();
  const { error } = await supabase.from("reports").insert({ reported_user_id: id, reason, details });
  if (error) return { error: "Couldn't send the report. Try again." };
  return { sent: true };
}

// Open (or start) a private chat with a friend.
export async function messageFriend(id: string) {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_dm", { other: id });
  if (error || !data) redirect(`/u/${id}`);
  redirect(`/chats/${data}`);
}

export type SearchResult = PersonCard & { relation: Relation };

export async function searchPeople(query: string): Promise<SearchResult[]> {
  const me = await requireProfile();
  const q = query.trim().replace(/[%_,()]/g, " ").slice(0, 60);
  if (q.length < 2) return [];
  const supabase = await createClient();
  const [{ data }, relations, hidden] = await Promise.all([
    supabase.from("profile_cards").select("id, name, avatar_url, course, bio").ilike("name", `%${q}%`).order("name").limit(25),
    getFriendships(supabase, me.id),
    getHiddenPeople(supabase),
  ]);
  return ((data ?? []) as PersonCard[])
    .filter((p) => p.id !== me.id && !hidden.has(p.id) && p.name !== "Member")
    .slice(0, 15)
    .map((p) => ({ ...p, relation: relationFor(relations, me.id, p.id) }));
}
