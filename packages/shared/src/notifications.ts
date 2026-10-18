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

export type TableMove = { id: string; eventId: string; event: string; table: string; at: string };

// Times you were moved off a poker table's waiting list onto the table.
export async function getTableMoves(supabase: SupabaseClient, me: string): Promise<TableMove[]> {
  const { data } = await supabase
    .from("table_moves")
    .select("id, event_id, created_at, events(title), event_tables!table_moves_to_table_fkey(name)")
    .eq("user_id", me)
    .gte("created_at", new Date(Date.now() - DAYS * 864e5).toISOString())
    .order("created_at", { ascending: false })
    .limit(20);
  type Row = { id: string; event_id: string; created_at: string; events: { title: string } | null; event_tables: { name: string } | null };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    eventId: r.event_id,
    event: r.events?.title ?? "your event",
    table: r.event_tables?.name ?? "your table",
    at: r.created_at,
  }));
}

export type TwoTruthsDay = { day: string; at: string; plays: number; right: number; rightNames: string[] };

// People playing your Two truths and a lie, one notification per day (UK
// time). Its time is the day's first play, so the bell lights up at most
// once a day however many people play.
export async function getTwoTruthsDays(supabase: SupabaseClient): Promise<TwoTruthsDay[]> {
  const { data, error } = await supabase.rpc("my_two_truths_days");
  if (error) return [];
  return ((data ?? []) as { day: string; first_at: string; plays: number; right_count: number; right_names: string[] | null }[]).map((r) => ({
    day: r.day,
    at: r.first_at,
    plays: Number(r.plays),
    right: Number(r.right_count),
    rightNames: r.right_names ?? [],
  }));
}

// "5 people played your Two truths and a lie. Sam, Alex and 1 more got it right."
export function twoTruthsLine(d: TwoTruthsDay) {
  const who = d.plays === 1 ? "Someone" : `${d.plays} people`;
  // Up to 3 names, then "and N more".
  const names = d.rightNames.slice(0, d.right > 3 ? 2 : 3);
  const parts = d.right > names.length ? [...names, `${d.right - names.length} more`] : names;
  const named = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  const right = d.right === 0 ? (d.plays === 1 ? "They didn't spot the lie." : "Nobody spotted the lie.") : `${named} got it right.`;
  return { played: `${who} played your Two truths and a lie`, right };
}
