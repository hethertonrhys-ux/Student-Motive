import type { SupabaseClient } from "@supabase/supabase-js";
import { getFriendRequests, getSocietyPosts, getTableMoves, getTwoTruthsDays, type FriendRequest, type SocietyPost, type TableMove, type TwoTruthsDay } from "./notifications";
import { getCards, getFriendships, getHiddenPeople, relationFor, type PersonCard, type Relation } from "./social";

// Messages, friends and notifications, read and written straight from the
// database (the website's server does the same; the database decides who
// may see and send what).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result = { error?: string };

// ---- Chats ----

export type Thread = {
  id: string;
  event_id: string | null;
  social_event_id: string | null;
  title: string;
  other_id: string | null;
  other_name: string | null;
  other_avatar: string | null;
  last_body: string | null;
  last_at: string;
  last_sender: string | null;
  unread: number;
};

export async function loadThreads(supabase: SupabaseClient, myId: string): Promise<{ threads: Thread[]; requests: number }> {
  const [{ data }, { count }] = await Promise.all([
    supabase.rpc("my_threads"),
    supabase.from("friendships").select("requester_id", { count: "exact", head: true }).eq("addressee_id", myId).eq("status", "pending"),
  ]);
  return { threads: ((data ?? []) as Thread[]).map((t) => ({ ...t, unread: Number(t.unread) })), requests: count ?? 0 };
}

export type ChatMessage = {
  id: string;
  body: string;
  created_at: string;
  sender_id: string | null;
  sender_name: string;
  sender_avatar: string | null;
  deleted: boolean;
};

// Messages in a chat, optionally only those after a time (for live updates). Opening marks it read.
export async function fetchMessages(supabase: SupabaseClient, threadId: string, after: string | null): Promise<ChatMessage[]> {
  if (!UUID.test(threadId)) return [];
  let query = supabase.from("messages").select("id, body, created_at, sender_id, deleted_at").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(100);
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

export type ThreadInfo = {
  event: { id: string; title: string; going_count: number } | null;
  socialEvent: { id: string; title: string; going_count: number } | null;
  other: PersonCard | null;
  hidden: Set<string>;
};

// Who the chat is with: an event (society or Social) or one other person.
export async function loadThreadInfo(supabase: SupabaseClient, threadId: string, myId: string): Promise<ThreadInfo | null> {
  if (!UUID.test(threadId)) return null;
  const { data: thread } = await supabase.from("threads").select("id, event_id, social_event_id, user_a, user_b").eq("id", threadId).maybeSingle<{ id: string; event_id: string | null; social_event_id: string | null; user_a: string | null; user_b: string | null }>();
  if (!thread) return null;
  const otherId = thread.event_id || thread.social_event_id ? null : thread.user_a === myId ? thread.user_b : thread.user_a;
  const [cards, hidden, { data: event }, { data: socialEvent }] = await Promise.all([
    getCards(supabase, otherId ? [otherId] : []),
    getHiddenPeople(supabase),
    thread.event_id ? supabase.from("events").select("id, title, going_count").eq("id", thread.event_id).maybeSingle() : Promise.resolve({ data: null }),
    thread.social_event_id ? supabase.from("social_events").select("id, title, going_count").eq("id", thread.social_event_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { event: (event as ThreadInfo["event"]) ?? null, socialEvent: (socialEvent as ThreadInfo["socialEvent"]) ?? null, other: otherId ? (cards.get(otherId) ?? null) : null, hidden };
}

export async function sendMessage(supabase: SupabaseClient, threadId: string, body: string): Promise<Result> {
  const text = body.trim();
  if (!text) return {};
  if (text.length > 2000) return { error: "That message is too long." };
  const { error } = await supabase.rpc("send_message", { tid: threadId, body: text });
  return error ? { error: error.message.replace(/^.*?: /, "") || "Couldn't send. Try again." } : {};
}

export async function deleteMessage(supabase: SupabaseClient, messageId: string) {
  await supabase.rpc("delete_message", { mid: messageId });
}

export async function reportMessage(supabase: SupabaseClient, messageId: string, reason: string): Promise<Result> {
  const { error } = await supabase.from("reports").insert({ message_id: messageId, reason: reason.slice(0, 200) || "Reported message" });
  return error ? { error: "Couldn't send the report. Try again." } : {};
}

// How many unread messages you have across all chats (for the tab's badge).
export async function getUnreadCount(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase.rpc("unread_message_count");
  return Number(data ?? 0);
}

// ---- Friends ----

export type FriendsPage = {
  friends: PersonCard[];
  incoming: PersonCard[];
  outgoing: PersonCard[];
  suggestions: (PersonCard & { shared_events: number })[];
};

export async function loadFriends(supabase: SupabaseClient, myId: string): Promise<FriendsPage> {
  const [relations, hidden, { data: suggestionRows }] = await Promise.all([getFriendships(supabase, myId), getHiddenPeople(supabase), supabase.rpc("people_you_may_know")]);
  const cards = await getCards(supabase, [...relations.keys()]);
  const pick = (r: Relation) =>
    [...relations.entries()]
      .filter(([id, rel]) => rel === r && !hidden.has(id))
      .map(([id]) => cards.get(id))
      .filter((c): c is PersonCard => !!c);
  return {
    friends: pick("friends").sort((a, b) => a.name.localeCompare(b.name)),
    incoming: pick("incoming"),
    outgoing: pick("outgoing"),
    suggestions: ((suggestionRows ?? []) as (PersonCard & { shared_events: number })[]).filter((s) => !hidden.has(s.id)),
  };
}

export type SearchResult = PersonCard & { relation: Relation };

export async function searchPeople(supabase: SupabaseClient, myId: string, query: string): Promise<SearchResult[]> {
  const q = query.trim().replace(/[%_,()]/g, " ").slice(0, 60);
  if (q.length < 2) return [];
  const [{ data }, relations, hidden] = await Promise.all([
    supabase.from("profile_cards").select("id, name, avatar_url, course, bio").ilike("name", `%${q}%`).order("name").limit(25),
    getFriendships(supabase, myId),
    getHiddenPeople(supabase),
  ]);
  return ((data ?? []) as PersonCard[])
    .filter((p) => p.id !== myId && !hidden.has(p.id) && p.name !== "Member")
    .slice(0, 15)
    .map((p) => ({ ...p, relation: relationFor(relations, myId, p.id) }));
}

// ---- Notifications ----

export type Notifications = { posts: SocietyPost[]; requests: FriendRequest[]; moves: TableMove[]; plays: TwoTruthsDay[]; cards: Map<string, PersonCard> };

export async function loadNotifications(supabase: SupabaseClient, myId: string): Promise<Notifications> {
  const [posts, requests, moves, plays] = await Promise.all([getSocietyPosts(supabase, myId), getFriendRequests(supabase, myId), getTableMoves(supabase, myId), getTwoTruthsDays(supabase)]);
  const cards = await getCards(supabase, requests.map((r) => r.id));
  return { posts, requests, moves, plays, cards };
}

// For the badge: when each notification happened. The phone compares them
// with when you last opened Notifications.
export async function getNotificationTimes(supabase: SupabaseClient, myId: string): Promise<string[]> {
  const n = await loadNotifications(supabase, myId);
  return [...n.posts, ...n.requests, ...n.moves, ...n.plays].map((x) => x.at);
}

// "5 min ago", "3 h ago", "2 days ago".
export function ago(iso: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// "today", "yesterday" or "on Mon 12 Oct" (UK dates).
export function dayWord(day: string) {
  const uk = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
  if (day === uk(new Date())) return "today";
  if (day === uk(new Date(Date.now() - 864e5))) return "yesterday";
  return `on ${new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(day + "T12:00:00Z"))}`;
}
