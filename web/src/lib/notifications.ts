import type { SupabaseClient } from "@supabase/supabase-js";

// What shows in Notifications. Built from what's already saved (society
// events, friend requests), so there's nothing extra to store.

export type SocietyPost = { id: string; title: string; society: string; at: string };
export type FriendRequest = { id: string; at: string };

const DAYS = 30;

// New events from the societies you're a member of, newest first.
export async function getSocietyPosts(supabase: SupabaseClient, me: string): Promise<SocietyPost[]> {
  const { data: memberships } = await supabase.from("society_members").select("society_id").eq("user_id", me).eq("status", "approved");
  const ids = (memberships ?? []).map((m) => m.society_id as string);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("events")
    .select("id, title, created_at, societies(name)")
    .in("society_id", ids)
    .eq("is_cancelled", false)
    .gte("created_at", new Date(Date.now() - DAYS * 864e5).toISOString())
    .order("created_at", { ascending: false })
    .limit(30);
  type Row = { id: string; title: string; created_at: string; societies: { name: string } | null };
  return ((data ?? []) as unknown as Row[]).map((r) => ({ id: r.id, title: r.title, society: r.societies?.name ?? "A society", at: r.created_at }));
}

// Friend requests waiting for your answer, newest first (minus anyone
// hidden by a block).
export async function getFriendRequests(supabase: SupabaseClient, me: string): Promise<FriendRequest[]> {
  const [{ data }, { data: hidden }] = await Promise.all([
    supabase
      .from("friendships")
      .select("requester_id, created_at")
      .eq("addressee_id", me)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase.rpc("hidden_people"),
  ]);
  const blocked = new Set(((hidden ?? []) as string[]).map(String));
  return ((data ?? []) as { requester_id: string; created_at: string }[])
    .filter((r) => !blocked.has(r.requester_id))
    .map((r) => ({ id: r.requester_id, at: r.created_at }));
}
