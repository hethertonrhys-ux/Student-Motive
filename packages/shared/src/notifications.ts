import type { SupabaseClient } from "@supabase/supabase-js";
import { missingColumn, withoutDrafts } from "./drafts";

// What shows in Notifications. Built from what's already saved (society
// events, friend requests), so there's nothing extra to store.

export type SocietyPost = { id: string; title: string; society: string; at: string };
export type FriendRequest = { id: string; at: string };

const DAYS = 30;

// New events from the societies you're a member of, newest first. Each is
// dated by when it was published, so a draft published weeks later shows
// then. Until the event admin migration has run there's no published_at
// (and no drafts), so it's dated by when it was created, as before.
export async function getSocietyPosts(supabase: SupabaseClient, me: string): Promise<SocietyPost[]> {
  const { data: memberships } = await supabase.from("society_members").select("society_id").eq("user_id", me).eq("status", "approved");
  const ids = (memberships ?? []).map((m) => m.society_id as string);
  if (ids.length === 0) return [];
  const since = new Date(Date.now() - DAYS * 864e5).toISOString();
  type Row = { id: string; title: string; created_at: string; published_at?: string | null; societies: { name: string } | null };
  const published = await supabase
    .from("events")
    .select("id, title, created_at, published_at, societies(name)")
    .in("society_id", ids)
    .eq("is_cancelled", false)
    .eq("is_draft", false)
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(30);
  let rows = published.data as unknown as Row[] | null;
  if (missingColumn(published, "published_at")) {
    const { data } = await withoutDrafts(() =>
      supabase
        .from("events")
        .select("id, title, created_at, societies(name)")
        .in("society_id", ids)
        .eq("is_cancelled", false)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(30),
    );
    rows = data as unknown as Row[] | null;
  }
  return (rows ?? []).map((r) => ({ id: r.id, title: r.title, society: r.societies?.name ?? "A society", at: r.published_at ?? r.created_at }));
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

export type SeatChange = { id: string; eventId: string; event: string; table: string; seatNo: number | null; at: string };

// Times the committee reshuffled your table (or moved your seat).
export async function getSeatChanges(supabase: SupabaseClient, me: string): Promise<SeatChange[]> {
  const { data } = await supabase
    .from("seat_changes")
    .select("id, event_id, seat_no, created_at, events(title), event_tables(name)")
    .eq("user_id", me)
    .gte("created_at", new Date(Date.now() - DAYS * 864e5).toISOString())
    .order("created_at", { ascending: false })
    .limit(20);
  type Row = { id: string; event_id: string; seat_no: number | null; created_at: string; events: { title: string } | null; event_tables: { name: string } | null };
  return ((data ?? []) as unknown as Row[]).map((r) => ({ id: r.id, eventId: r.event_id, event: r.events?.title ?? "your event", table: r.event_tables?.name ?? "your table", seatNo: r.seat_no, at: r.created_at }));
}

// One person who played your Two truths and a lie (names only, never emails).
export type TwoTruthsPlayer = { id: string; name: string; avatarUrl: string | null; right: boolean; at: string };
export type TwoTruthsDay = { day: string; at: string; plays: number; right: number; rightNames: string[]; players: TwoTruthsPlayer[] };

const londonDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(iso));

// Plays grouped by day (UK time), newest day first, each day's players in
// the order they played. A day's time is its first play, so the bell lights
// up at most once a day however many people play.
export function groupTwoTruthsPlays(players: TwoTruthsPlayer[]): TwoTruthsDay[] {
  const days = new Map<string, TwoTruthsPlayer[]>();
  for (const p of [...players].sort((a, b) => a.at.localeCompare(b.at))) {
    const day = londonDay(p.at);
    days.set(day, [...(days.get(day) ?? []), p]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, list]) => ({ day, at: list[0].at, plays: list.length, right: list.filter((p) => p.right).length, rightNames: list.filter((p) => p.right).map((p) => p.name), players: list }));
}

// People playing your Two truths and a lie, one notification per day, each
// naming who played. (Before the names migration is run, falls back to the
// older counts-only version.)
export async function getTwoTruthsDays(supabase: SupabaseClient): Promise<TwoTruthsDay[]> {
  const { data, error } = await supabase.rpc("my_two_truths_plays");
  if (!error) {
    type Row = { guesser_id: string; name: string; avatar_url: string | null; correct: boolean; played_at: string };
    return groupTwoTruthsPlays(((data ?? []) as Row[]).map((r) => ({ id: r.guesser_id, name: r.name, avatarUrl: r.avatar_url, right: r.correct, at: r.played_at })));
  }
  const old = await supabase.rpc("my_two_truths_days");
  if (old.error) return [];
  return ((old.data ?? []) as { day: string; first_at: string; plays: number; right_count: number; right_names: string[] | null }[]).map((r) => ({
    day: r.day,
    at: r.first_at,
    plays: Number(r.plays),
    right: Number(r.right_count),
    rightNames: r.right_names ?? [],
    players: [],
  }));
}

// How many names to show before "and N more".
export const TWO_TRUTHS_NAMES_SHOWN = 3;

// "Sam played your Two truths and a lie" + "They spotted the lie!", or
// "Sam, Alex and 3 more played your Two truths and a lie" + "2 of them
// spotted the lie." `shown` are the players named in the line; `more` is
// how many aren't (tap to see them all).
export function twoTruthsLine(d: TwoTruthsDay) {
  if (d.players.length === 0) {
    // The older counts-only version.
    const who = d.plays === 1 ? "Someone" : `${d.plays} people`;
    const names = d.rightNames.slice(0, d.right > 3 ? 2 : 3);
    const parts = d.right > names.length ? [...names, `${d.right - names.length} more`] : names;
    const named = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
    const right = d.right === 0 ? (d.plays === 1 ? "They didn't spot the lie." : "Nobody spotted the lie.") : `${named} got it right.`;
    return { played: `${who} played your Two truths and a lie`, right, shown: [] as TwoTruthsPlayer[], more: 0 };
  }
  const n = d.players.length;
  const shown = d.players.slice(0, n > TWO_TRUTHS_NAMES_SHOWN ? TWO_TRUTHS_NAMES_SHOWN - 1 : TWO_TRUTHS_NAMES_SHOWN);
  const more = n - shown.length;
  const parts = [...shown.map((p) => p.name), ...(more ? [`${more} more`] : [])];
  const named = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  const right = n === 1 ? (d.players[0].right ? "They spotted the lie!" : "They didn't spot the lie.") : d.right === 0 ? "Nobody spotted the lie." : d.right === n ? "They all spotted the lie!" : `${d.right} of them spotted the lie.`;
  return { played: `${named} played your Two truths and a lie`, right, shown, more };
}
