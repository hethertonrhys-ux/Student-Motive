import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEventHosts } from "./event-actions";
import { getFriendRequests, getSocietyPosts, getTableMoves, getTwoTruthsDays, type FriendRequest, type SocietyPost, type TableMove, type TwoTruthsDay, getSeatChanges, type SeatChange } from "./notifications";
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

// "message" is what people write; "event" is an event someone shared (shown
// as a card); "photo" and "video" are files sent in the chat; "left" and
// "rejoined" are the notes a group chat shows when someone leaves it or
// comes back ("Rhys left"), and "removed" when an admin takes someone out
// ("Sam removed Rhys from the group").
export type MessageKind = "message" | "event" | "photo" | "video" | "left" | "rejoined" | "removed";

export const isNote = (kind: MessageKind) => kind === "left" || kind === "rejoined" || kind === "removed";

export type ChatMessage = {
  id: string;
  kind: MessageKind;
  // The shared event (kind "event"): a society event or a Social plan.
  event_id: string | null;
  social_event_id: string | null;
  // A photo or video (kinds "photo" and "video"): where it's stored, its size and length.
  media_path: string | null;
  media_width: number | null;
  media_height: number | null;
  media_duration_ms: number | null;
  // Who a "removed" note is about.
  subject_user_id: string | null;
  body: string;
  created_at: string;
  sender_id: string | null;
  sender_name: string;
  sender_avatar: string | null;
  deleted: boolean;
};

// Every message from a time onwards (oldest first), to reach a pinned
// message older than the latest 100.
export async function fetchMessagesFrom(supabase: SupabaseClient, threadId: string, from: string): Promise<ChatMessage[]> {
  if (!UUID.test(threadId)) return [];
  const { data } = await supabase.from("messages").select("*").eq("thread_id", threadId).gte("created_at", from).order("created_at", { ascending: true }).limit(1000);
  return toChatMessages(supabase, (data ?? []) as MessageRow[]);
}

type MessageRow = { id: string; kind?: MessageKind; event_id?: string | null; social_event_id?: string | null; media_path?: string | null; media_width?: number | null; media_height?: number | null; media_duration_ms?: number | null; subject_user_id?: string | null; body: string; created_at: string; sender_id: string | null; deleted_at: string | null };

async function toChatMessages(supabase: SupabaseClient, rows: MessageRow[]): Promise<ChatMessage[]> {
  const cards = await getCards(supabase, rows.map((r) => r.sender_id).filter((x): x is string => !!x));
  return rows.map((r) => toChatMessage(r, cards));
}

function toChatMessage(r: MessageRow, cards: Map<string, PersonCard>): ChatMessage {
  return {
    id: r.id,
    kind: r.kind ?? "message",
    event_id: r.event_id ?? null,
    social_event_id: r.social_event_id ?? null,
    media_path: r.deleted_at ? null : (r.media_path ?? null),
    media_width: r.media_width ?? null,
    media_height: r.media_height ?? null,
    media_duration_ms: r.media_duration_ms ?? null,
    subject_user_id: r.subject_user_id ?? null,
    body: r.deleted_at ? "" : r.body,
    created_at: r.created_at,
    sender_id: r.sender_id,
    sender_name: (r.sender_id && cards.get(r.sender_id)?.name) || "Former member",
    sender_avatar: (r.sender_id && cards.get(r.sender_id)?.avatar_url) || null,
    deleted: Boolean(r.deleted_at),
  };
}

// Messages in a chat, optionally only those after a time (for live updates). Opening marks it read.
export async function fetchMessages(supabase: SupabaseClient, threadId: string, after: string | null): Promise<ChatMessage[]> {
  if (!UUID.test(threadId)) return [];
  // All columns, so this still works before the database has the "kind" column.
  let query = supabase.from("messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(100);
  if (after) query = query.gt("created_at", after);
  const { data } = await query;
  const rows = (data ?? []).reverse() as MessageRow[];
  // Who sent them, and (on opening, or when something new arrived) mark the chat read: both at once.
  const [cards] = await Promise.all([
    getCards(supabase, rows.map((r) => r.sender_id).filter((x): x is string => !!x)),
    after === null || rows.length > 0 ? supabase.rpc("mark_thread_read", { tid: threadId }) : Promise.resolve(null),
  ]);
  return rows.map((r) => toChatMessage(r, cards));
}

export type ThreadInfo = {
  event: { id: string; title: string; going_count: number } | null;
  socialEvent: { id: string; title: string; going_count: number } | null;
  other: PersonCard | null;
  hidden: Set<string>;
  // Who gets the Host badge: the student hosting, or the society's committee.
  hostIds: Set<string>;
  // An event's chat (anyone in it can leave), not a private one.
  isGroup: boolean;
  // You left this group chat (you can rejoin while you're going).
  left: boolean;
  // You run this group chat (the event's host or committee, or the plan's host).
  isAdmin: boolean;
  // Everyone in the chat may share events (admins can switch it off).
  membersCanShare: boolean;
  // An admin took you out of this group chat (you can't rejoin by yourself).
  removed: boolean;
  // The pinned message, and whether you may pin and unpin (admins in a
  // group chat, either person in a private one).
  pinnedMessageId: string | null;
  canPin: boolean;
};

// Who the chat is with: an event (society or Social) or one other person.
export async function loadThreadInfo(supabase: SupabaseClient, threadId: string, myId: string): Promise<ThreadInfo | null> {
  if (!UUID.test(threadId)) return null;
  // All columns, so this still works before the database has members_can_share_events.
  const { data: thread } = await supabase.from("threads").select("*").eq("id", threadId).maybeSingle<{ id: string; event_id: string | null; social_event_id: string | null; user_a: string | null; user_b: string | null; members_can_share_events?: boolean; pinned_message_id?: string | null }>();
  if (!thread) return null;
  const otherId = thread.event_id || thread.social_event_id ? null : thread.user_a === myId ? thread.user_b : thread.user_a;
  const isGroup = !!(thread.event_id || thread.social_event_id);
  const [cards, hidden, { data: event }, { data: socialEvent }, hosts, { data: leave }, { data: admin }] = await Promise.all([
    getCards(supabase, otherId ? [otherId] : []),
    getHiddenPeople(supabase),
    thread.event_id ? supabase.from("events").select("id, title, going_count").eq("id", thread.event_id).maybeSingle() : Promise.resolve({ data: null }),
    thread.social_event_id ? supabase.from("social_events").select("id, title, host_id, going_count").eq("id", thread.social_event_id).maybeSingle() : Promise.resolve({ data: null }),
    thread.event_id ? loadEventHosts(supabase, thread.event_id) : Promise.resolve(new Set<string>()),
    // Only your own row is readable. Before the database change there's no table: not left.
    // All columns, so this still works before the database has removed_by.
    isGroup ? supabase.from("thread_leaves").select("*").eq("thread_id", threadId).eq("user_id", myId).maybeSingle() : Promise.resolve({ data: null }),
    isGroup ? supabase.rpc("is_thread_admin", { tid: threadId }) : Promise.resolve({ data: false }),
  ]);
  const social = socialEvent as (ThreadInfo["socialEvent"] & { host_id: string }) | null;
  const hostIds = thread.event_id ? hosts : new Set(social ? [social.host_id] : []);
  return { event: (event as ThreadInfo["event"]) ?? null, socialEvent: social ? { id: social.id, title: social.title, going_count: social.going_count } : null, other: otherId ? (cards.get(otherId) ?? null) : null, hidden, hostIds, isGroup, left: !!leave, isAdmin: admin === true, membersCanShare: thread.members_can_share_events !== false, removed: !!(leave as { removed_by?: string | null } | null)?.removed_by, pinnedMessageId: thread.pinned_message_id ?? null, canPin: !isGroup || admin === true };
}

export async function sendMessage(supabase: SupabaseClient, threadId: string, body: string): Promise<Result> {
  const text = body.trim();
  if (!text) return {};
  if (text.length > 2000) return { error: "That message is too long." };
  const { error } = await supabase.rpc("send_message", { tid: threadId, body: text });
  return error ? { error: error.message.replace(/^.*?: /, "") || "Couldn't send. Try again." } : {};
}

// ---- Shared events ----

// What a shared event's card shows. Loaded with the viewer's own rights, so
// an event they can't see (friends only, removed) just isn't in the map.
export type SharedEvent = {
  id: string;
  kind: "event" | "social";
  title: string;
  starts_at: string;
  ends_at: string;
  place: string | null;
  going: number;
  image_url: string | null;
  is_cancelled: boolean;
  is_private: boolean;
  friends_only: boolean;
  href: string;
};

export async function loadSharedEvents(supabase: SupabaseClient, eventIds: string[], socialIds: string[]): Promise<Map<string, SharedEvent>> {
  const ev = [...new Set(eventIds)].filter((x) => UUID.test(x));
  const so = [...new Set(socialIds)].filter((x) => UUID.test(x));
  const [{ data: events }, { data: plans }] = await Promise.all([
    ev.length ? supabase.from("events").select("id, title, starts_at, ends_at, going_count, image_url, is_cancelled, location_note, venues(name)").in("id", ev) : Promise.resolve({ data: [] }),
    so.length ? supabase.from("social_events").select("id, title, starts_at, ends_at, going_count, area, is_cancelled, is_private, friends_only").in("id", so) : Promise.resolve({ data: [] }),
  ]);
  const out = new Map<string, SharedEvent>();
  for (const e of (events ?? []) as { id: string; title: string; starts_at: string; ends_at: string; going_count: number; image_url: string | null; is_cancelled: boolean; location_note: string | null; venues: { name: string } | { name: string }[] | null }[]) {
    const venue = Array.isArray(e.venues) ? e.venues[0] : e.venues;
    out.set(e.id, { id: e.id, kind: "event", title: e.title, starts_at: e.starts_at, ends_at: e.ends_at, place: venue?.name ?? e.location_note ?? null, going: e.going_count, image_url: e.image_url, is_cancelled: e.is_cancelled, is_private: false, friends_only: false, href: `/e/${e.id}` });
  }
  for (const s of (plans ?? []) as { id: string; title: string; starts_at: string; ends_at: string; going_count: number; area: string; is_cancelled: boolean; is_private: boolean; friends_only: boolean }[]) {
    // The host counts too.
    out.set(s.id, { id: s.id, kind: "social", title: s.title, starts_at: s.starts_at, ends_at: s.ends_at, place: s.area, going: s.going_count + 1, image_url: null, is_cancelled: s.is_cancelled, is_private: s.is_private, friends_only: s.friends_only, href: `/social/${s.id}` });
  }
  return out;
}

export type ShareTarget = { id: string; title: string; isGroup: boolean; otherAvatar: string | null; allowed: boolean };

// The chats you can send an event to, newest first. A group chat whose
// admins switched sharing off is listed but not allowed (unless you're one
// of its admins).
export async function loadShareTargets(supabase: SupabaseClient): Promise<ShareTarget[]> {
  const { data } = await supabase.rpc("my_threads");
  const threads = (data ?? []) as Thread[];
  const groups = threads.filter((t) => t.event_id || t.social_event_id).map((t) => t.id);
  const { data: settings } = groups.length ? await supabase.from("threads").select("*").in("id", groups) : { data: [] };
  const off = ((settings ?? []) as { id: string; members_can_share_events?: boolean }[]).filter((t) => t.members_can_share_events === false).map((t) => t.id);
  const admin = new Set<string>();
  await Promise.all(off.map(async (id) => {
    const { data: yes } = await supabase.rpc("is_thread_admin", { tid: id });
    if (yes === true) admin.add(id);
  }));
  return threads.map((t) => ({ id: t.id, title: t.title, isGroup: !!(t.event_id || t.social_event_id), otherAvatar: t.other_avatar, allowed: !off.includes(t.id) || admin.has(t.id) }));
}

// Send an event into a chat. The database checks you're in the chat, may
// share there and can see the event; it writes the text itself.
export async function shareEventToChat(supabase: SupabaseClient, threadId: string, myId: string, target: { eventId: string } | { socialEventId: string }): Promise<Result> {
  if (!UUID.test(threadId)) return { error: "Chat not found." };
  const { error } = await supabase.from("messages").insert({
    thread_id: threadId,
    sender_id: myId,
    kind: "event",
    body: "Shared an event",
    event_id: "eventId" in target ? target.eventId : null,
    social_event_id: "socialEventId" in target ? target.socialEventId : null,
  });
  if (!error) return {};
  return { error: /row-level security|violates/i.test(error.message) ? "You can't share this event in that chat. In some group chats only the admins can share events." : "Couldn't send. Try again." };
}

// Group chat admins: let everyone share events, or only admins.
export async function setMembersCanShareEvents(supabase: SupabaseClient, threadId: string, allowed: boolean): Promise<Result> {
  const { error } = await supabase.rpc("set_members_can_share_events", { tid: threadId, allowed });
  return error ? { error: "Couldn't change the setting. Try again." } : {};
}

// Leave a group chat: it goes from your Chats, you stop getting its
// messages and pushes, and the others see "<name> left". Your place at the
// event stays as it is.
export async function leaveChat(supabase: SupabaseClient, threadId: string): Promise<Result> {
  const { error } = await supabase.rpc("leave_thread", { tid: threadId });
  if (!error) return {};
  return { error: /only admin/.test(error.message) ? "You're this group's only admin. Make someone else an admin (in Members) before you leave." : "Couldn't leave the group. Try again." };
}

// ---- Pinned messages ----

export async function pinMessage(supabase: SupabaseClient, messageId: string): Promise<Result> {
  const { error } = await supabase.rpc("pin_message", { mid: messageId });
  return error ? { error: /admins/.test(error.message) ? "Only the chat's admins can pin messages." : "Couldn't pin it. Try again." } : {};
}

export async function unpinMessage(supabase: SupabaseClient, threadId: string): Promise<Result> {
  const { error } = await supabase.rpc("unpin_message", { tid: threadId });
  return error ? { error: "Couldn't unpin it. Try again." } : {};
}

// One message (the pinned one, when it isn't among those loaded).
export async function fetchMessage(supabase: SupabaseClient, messageId: string): Promise<ChatMessage | null> {
  if (!UUID.test(messageId)) return null;
  const { data } = await supabase.from("messages").select("*").eq("id", messageId).maybeSingle();
  if (!data) return null;
  return (await toChatMessages(supabase, [data as MessageRow]))[0] ?? null;
}

// What a message says in a line (the pinned bar, previews).
export function messagePreview(m: Pick<ChatMessage, "kind" | "body" | "deleted">): string {
  if (m.deleted) return "Message deleted";
  if (m.kind === "photo") return "Photo";
  if (m.kind === "video") return "Video";
  if (m.kind === "event") return m.body.replace(/^Shared an event: /, "Event: ").replace(/ https:\/\/\S+$/, "");
  return m.body;
}

// ---- Group chat members and admins ----

export type ThreadMember = { user_id: string; name: string; avatar_url: string | null; is_admin: boolean; is_organiser: boolean; is_me: boolean; removed: boolean };

// Who's in a group chat (names and photos only). Admins also get who was removed.
export async function loadThreadMembers(supabase: SupabaseClient, threadId: string): Promise<ThreadMember[]> {
  if (!UUID.test(threadId)) return [];
  const { data, error } = await supabase.rpc("thread_members", { tid: threadId });
  if (error) throw error;
  return (data ?? []) as ThreadMember[];
}

const adminError = (message: string) =>
  /at least one admin/.test(message) ? "A chat needs at least one admin. Make someone else an admin first."
  : /always admins/.test(message) ? "Organisers are always admins."
  : /Organisers/.test(message) ? "Organisers can't be removed from their chat."
  : /Only the chat's admins/.test(message) ? "Only the chat's admins can do that."
  : /not in this chat/.test(message) ? "They're not in this chat any more."
  : "That didn't work. Try again.";

export async function setThreadAdmin(supabase: SupabaseClient, threadId: string, userId: string, makeAdmin: boolean): Promise<Result> {
  const { error } = await supabase.rpc("set_thread_admin", { tid: threadId, uid: userId, make_admin: makeAdmin });
  return error ? { error: adminError(error.message) } : {};
}

// Take someone out of the group chat (not the event). They can't rejoin by themselves.
export async function removeFromThread(supabase: SupabaseClient, threadId: string, userId: string): Promise<Result> {
  const { error } = await supabase.rpc("remove_from_thread", { tid: threadId, uid: userId });
  return error ? { error: adminError(error.message) } : {};
}

export async function addBackToThread(supabase: SupabaseClient, threadId: string, userId: string): Promise<Result> {
  const { error } = await supabase.rpc("add_back_to_thread", { tid: threadId, uid: userId });
  return error ? { error: adminError(error.message) } : {};
}

// Back into a group chat you left (only while you're still going).
export async function rejoinChat(supabase: SupabaseClient, threadId: string): Promise<Result> {
  const { error } = await supabase.rpc("rejoin_thread", { tid: threadId });
  return error ? { error: /going/.test(error.message) ? "Only people going can join this chat." : "Couldn't rejoin. Try again." } : {};
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
    supabase.from("profile_cards").select("id, name, avatar_url, course, bio, university, country").ilike("name", `%${q}%`).order("name").limit(25),
    getFriendships(supabase, myId),
    getHiddenPeople(supabase),
  ]);
  return ((data ?? []) as PersonCard[])
    .filter((p) => p.id !== myId && !hidden.has(p.id) && p.name !== "Member")
    .slice(0, 15)
    .map((p) => ({ ...p, relation: relationFor(relations, myId, p.id) }));
}

// ---- Notifications ----

export type Notifications = { posts: SocietyPost[]; requests: FriendRequest[]; moves: TableMove[]; seats: SeatChange[]; plays: TwoTruthsDay[]; cards: Map<string, PersonCard> };

export async function loadNotifications(supabase: SupabaseClient, myId: string): Promise<Notifications> {
  const [posts, requests, moves, seats, plays] = await Promise.all([getSocietyPosts(supabase, myId), getFriendRequests(supabase, myId), getTableMoves(supabase, myId), getSeatChanges(supabase, myId), getTwoTruthsDays(supabase)]);
  const cards = await getCards(supabase, requests.map((r) => r.id));
  return { posts, requests, moves, seats, plays, cards };
}

// For the badge: when each notification happened. The phone compares them
// with when you last opened Notifications.
export async function getNotificationTimes(supabase: SupabaseClient, myId: string): Promise<string[]> {
  const n = await loadNotifications(supabase, myId);
  return [...n.posts, ...n.requests, ...n.moves, ...n.seats, ...n.plays].map((x) => x.at);
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
