import type { SupabaseClient } from "@supabase/supabase-js";
import { getCards, type PersonCard } from "./social";
import { SOCIAL_CATEGORIES, SOCIAL_EVENT_FIELDS, type MemberStatus, type SocialCategory, type SocialEvent } from "./social-events";
import { END_SAME_AS_START, MAX_SOCIAL_HOURS, TOO_LONG_SOCIAL } from "./event-times";
import { londonInputToIso, nowMs } from "./time";
import { sharePerPerson } from "./payments";

// The Social section (students hosting their own plans): reads and taps,
// straight from the database. The website's server does the same.

type Result = { error?: string };
// The database's messages are written for people, so show them as they are.
const friendly = (message?: string) => message?.replace(/^.*?ERROR:\s*/, "") || "Something went wrong. Please try again.";
const done = ({ error }: { error: { message: string } | null }): Result => (error ? { error: friendly(error.message) } : {});

export type SocialTab = "discover" | "hosting" | "going";

export type SocialTabData = {
  events: SocialEvent[];
  status: Record<string, MemberStatus>;
  pending: Record<string, number>;
  hosts: Map<string, PersonCard>;
  // Requests waiting on events you host (for the Hosting tab's red number).
  hostingBadge: number;
};

export async function loadSocialTab(supabase: SupabaseClient, myId: string | null, tab: SocialTab): Promise<SocialTabData> {
  const now = nowMs();
  const nowIso = new Date(now).toISOString();
  const badge = myId
    ? supabase
        .from("social_event_members")
        .select("event_id, social_events!inner(host_id, ends_at, is_cancelled)", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("social_events.host_id", myId)
        .eq("social_events.is_cancelled", false)
        .gt("social_events.ends_at", nowIso)
    : null;

  let events: SocialEvent[] = [];
  const status: Record<string, MemberStatus> = {};
  const pending: Record<string, number> = {};

  if (tab === "discover" || !myId) {
    // Every upcoming event; search and filters then work on the phone.
    let query = supabase.from("social_events").select(SOCIAL_EVENT_FIELDS).eq("is_cancelled", false).gt("ends_at", nowIso).order("starts_at").limit(200);
    if (myId) query = query.neq("host_id", myId);
    const [{ data }, { data: mine }] = await Promise.all([query, myId ? supabase.from("social_event_members").select("event_id, status").eq("user_id", myId) : Promise.resolve({ data: [] })]);
    events = (data ?? []) as SocialEvent[];
    for (const m of mine ?? []) status[m.event_id] = m.status as MemberStatus;
  } else if (tab === "hosting") {
    const { data } = await supabase.from("social_events").select(SOCIAL_EVENT_FIELDS).eq("host_id", myId).gt("ends_at", new Date(now - 86400e3).toISOString()).order("starts_at");
    events = (data ?? []) as SocialEvent[];
    if (events.length) {
      const { data: reqs } = await supabase.from("social_event_members").select("event_id").eq("status", "pending").in("event_id", events.map((e) => e.id));
      for (const r of reqs ?? []) pending[r.event_id] = (pending[r.event_id] ?? 0) + 1;
    }
  } else {
    const { data } = await supabase.from("social_event_members").select(`status, social_events(${SOCIAL_EVENT_FIELDS})`).eq("user_id", myId);
    for (const row of data ?? []) {
      const ev = row.social_events as unknown as SocialEvent | null;
      if (!ev || new Date(ev.ends_at).getTime() < now - 86400e3) continue;
      events.push(ev);
      status[ev.id] = row.status as MemberStatus;
    }
    events.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }

  const [hosts, badgeResult] = await Promise.all([getCards(supabase, events.map((e) => e.host_id)), badge]);
  const totalPending = Object.values(pending).reduce((a, b) => a + b, 0);
  return { events, status, pending, hosts, hostingBadge: tab === "hosting" ? totalPending : (badgeResult?.count ?? 0) };
}

// ---- One event ----

export type SocialMember = { user_id: string; status: MemberStatus; created_at: string };
export type SocialEventPage = {
  event: SocialEvent;
  members: SocialMember[];
  address: { address: string | null; lat: number | null; lng: number | null } | null;
  chatId: string | null;
  myPrompts: number | null;
  cards: Map<string, PersonCard>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadSocialEvent(supabase: SupabaseClient, id: string, myId: string | null): Promise<SocialEventPage | null> {
  if (!UUID.test(id)) return null;
  const [{ data: event }, { data: memberRows }, { data: address }, { data: chat }, { count: myPrompts }] = await Promise.all([
    supabase.from("social_events").select(SOCIAL_EVENT_FIELDS).eq("id", id).maybeSingle(),
    myId ? supabase.from("social_event_members").select("user_id, status, created_at").eq("event_id", id).order("created_at") : Promise.resolve({ data: [] }),
    myId ? supabase.from("social_event_addresses").select("address, lat, lng").eq("event_id", id).maybeSingle() : Promise.resolve({ data: null }),
    // The group chat: only the host and people going can see it.
    myId ? supabase.from("threads").select("id").eq("social_event_id", id).maybeSingle() : Promise.resolve({ data: null }),
    // Whether you've answered any profile prompts (for private events, the host sees your profile).
    myId ? supabase.from("profile_prompts").select("prompt_id", { count: "exact", head: true }).eq("user_id", myId) : Promise.resolve({ count: null }),
  ]);
  if (!event) return null;
  const members = (memberRows ?? []) as SocialMember[];
  const cards = await getCards(supabase, [(event as SocialEvent).host_id, ...members.map((m) => m.user_id)]);
  return { event: event as SocialEvent, members, address: (address as SocialEventPage["address"]) ?? null, chatId: (chat as { id: string } | null)?.id ?? null, myPrompts, cards };
}

export const joinSocialEvent = async (supabase: SupabaseClient, id: string): Promise<Result> => done(await supabase.rpc("social_join", { eid: id }));
export const leaveSocialEvent = async (supabase: SupabaseClient, id: string): Promise<Result> => done(await supabase.rpc("social_leave", { eid: id }));
export const respondToRequest = async (supabase: SupabaseClient, id: string, guest: string, approve: boolean): Promise<Result> => done(await supabase.rpc("social_respond", { eid: id, guest, approve }));
export const removeSocialGuest = async (supabase: SupabaseClient, id: string, guest: string): Promise<Result> => done(await supabase.rpc("social_remove_guest", { eid: id, guest }));

export async function cancelSocialEvent(supabase: SupabaseClient, id: string, myId: string): Promise<Result> {
  const { error } = await supabase.from("social_events").update({ is_cancelled: true }).eq("id", id).eq("host_id", myId);
  return error ? { error: "Couldn't cancel. Please try again." } : {};
}

export async function reportSocialEvent(supabase: SupabaseClient, id: string, reason: string): Promise<Result> {
  const clean = reason.trim().slice(0, 200);
  if (!clean) return { error: "Say why you're reporting it." };
  const { error } = await supabase.from("social_reports").insert({ event_id: id, reason: clean });
  return error ? { error: "Couldn't send the report. Please try again." } : {};
}

// Message the host privately (no need to be friends). Returns the chat's id.
export async function openHostChat(supabase: SupabaseClient, eventId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("open_host_dm", { eid: eventId });
  return error || !data ? null : (data as string);
}

// ---- Hosting: the form ----

export type SocialEventInput = {
  title: string;
  category: string;
  description: string;
  date: string; // YYYY-MM-DD (UK time)
  start: string; // HH:MM
  finish: string; // HH:MM or ""
  area: string;
  address: string;
  lat: number | null;
  lng: number | null;
  spaces: string;
  costKind: "none" | "free" | "paid";
  // "paid": the TOTAL cost, split across the spaces (the host is one of them).
  costAmount: string;
  // Paid plans: people pay their share in the app (needs payouts set up).
  collectPayments: boolean;
  feeMode: "added" | "absorbed";
  isPrivate: boolean;
  friendsOnly: boolean;
};

// The cost from the form's Cost field: not said, Free, or a price in pounds.
export function readCostInput(kind: string, amount: string, max = 1000): { value: number | null } | { error: string } {
  if (kind === "free") return { value: 0 };
  if (kind !== "paid") return { value: null };
  const raw = amount.trim().replace(/^£/, "").replace(/,/g, "");
  const pounds = Number(raw);
  if (!raw || !Number.isFinite(pounds) || pounds <= 0 || pounds > max) return { error: `Enter the cost in pounds, e.g. 6 or 6.50 (up to £${max.toLocaleString("en-GB")}).` };
  return { value: Math.round(pounds * 100) };
}

// Everyone sees roughly where it is (about a 5-minute walk across);
// only the host and people going see the exact spot.
function blur(lat: number, lng: number) {
  return { lat: Math.round(lat / 0.004) * 0.004, lng: Math.round(lng / 0.006) * 0.006 };
}

export type ParsedSocialEvent = {
  event: { title: string; category: SocialCategory; description: string | null; starts_at: string; ends_at: string; area: string; lat: number; lng: number; spaces: number; cost_pence: number | null; is_private: boolean; friends_only: boolean; collect_payments: boolean; total_cost_pence: number | null; fee_mode: "added" | "absorbed" };
  exact: { address: string | null; lat: number; lng: number };
};

export function readSocialEventInput(input: SocialEventInput): ParsedSocialEvent | { error: string } {
  const text = (value: string, max: number) => value.trim().slice(0, max) || null;
  const title = text(input.title, 120);
  const category = input.category as SocialCategory;
  const area = text(input.area, 120);
  const address = text(input.address, 200);
  const lat = input.lat ?? NaN;
  const lng = input.lng ?? NaN;
  const spaces = Number(input.spaces.trim());

  if (!title) return { error: "Give your event a title." };
  if (!SOCIAL_CATEGORIES.some((c) => c.value === category)) return { error: "Choose a category." };
  const startsAt = londonInputToIso(`${input.date}T${input.start}`);
  if (!input.date || !input.start || !startsAt) return { error: "Choose the date and start time." };
  // No finish time: assume three hours. A finish time earlier than the start means after midnight.
  let endsAt = new Date(new Date(startsAt).getTime() + 3 * 3600e3).toISOString();
  if (input.finish) {
    const sameDay = londonInputToIso(`${input.date}T${input.finish}`);
    if (!sameDay) return { error: "Check the finish time." };
    if (sameDay === startsAt) return { error: END_SAME_AS_START };
    endsAt = new Date(sameDay) > new Date(startsAt) ? sameDay : new Date(new Date(sameDay).getTime() + 24 * 3600e3).toISOString();
    if (new Date(endsAt).getTime() - new Date(startsAt).getTime() > MAX_SOCIAL_HOURS * 3600e3) return { error: TOO_LONG_SOCIAL };
  }
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return { error: "Search for the place or tap the map to show where it is." };
  if (!area) return { error: "Add the place name everyone sees, e.g. Powerleague Shoreditch." };
  if (!Number.isInteger(spaces) || spaces < 2 || spaces > 500) return { error: "Spaces must be a whole number from 2 to 500 (including you)." };
  // "Costs money": the total, split across every space (the host included), rounded up.
  const total = readCostInput(input.costKind, input.costAmount, input.costKind === "paid" ? 10000 : 1000);
  if ("error" in total) return { error: total.error };
  const paid = input.costKind === "paid" && total.value != null;
  const share = paid ? sharePerPerson(total.value!, spaces) : total.value;
  const collect = paid && input.collectPayments;
  if (collect && share! < 100) return { error: "Each person's share must be at least £1." };

  const rough = blur(lat, lng);
  return {
    event: {
      title,
      category,
      description: text(input.description, 3000),
      starts_at: startsAt,
      ends_at: endsAt,
      area,
      lat: rough.lat,
      lng: rough.lng,
      spaces,
      cost_pence: share,
      is_private: input.isPrivate,
      friends_only: input.friendsOnly,
      collect_payments: collect,
      total_cost_pence: paid ? total.value : null,
      fee_mode: input.feeMode,
    },
    exact: { address, lat, lng },
  };
}

export async function createSocialEvent(supabase: SupabaseClient, myId: string, input: SocialEventInput): Promise<{ id: string } | { error: string }> {
  const parsed = readSocialEventInput(input);
  if ("error" in parsed) return { error: parsed.error };
  const { data, error } = await supabase.from("social_events").insert({ ...parsed.event, host_id: myId }).select("id").single();
  if (error || !data) return { error: "Couldn't create your event. Please try again." };
  await supabase.from("social_event_addresses").insert({ event_id: data.id, ...parsed.exact });
  return { id: data.id as string };
}

export async function updateSocialEvent(supabase: SupabaseClient, myId: string, id: string, input: SocialEventInput): Promise<Result> {
  const parsed = readSocialEventInput(input);
  if ("error" in parsed) return { error: parsed.error };
  const { data: current } = await supabase.from("social_events").select("going_count").eq("id", id).eq("host_id", myId).maybeSingle();
  if (!current) return { error: "Only the host can edit this event." };
  if (parsed.event.spaces < current.going_count + 1) return { error: `${current.going_count} people are already going, so you need at least ${current.going_count + 1} spaces.` };
  const { error } = await supabase.from("social_events").update(parsed.event).eq("id", id).eq("host_id", myId);
  if (error) return { error: "Couldn't save your changes. Please try again." };
  await supabase.from("social_event_addresses").upsert({ event_id: id, ...parsed.exact });
  return {};
}

// ---- Finding a place (for the place picker) ----

export type PlaceResult = { label: string; detail: string; point: { lng: number; lat: number } };

// Addresses from Photon (built on OpenStreetMap): free, no key, with results near the uni first.
export async function searchAddresses(query: string, near: [number, number], signal?: AbortSignal): Promise<PlaceResult[]> {
  const url = `https://photon.komoot.io/api/?limit=5&lang=en&lat=${near[1]}&lon=${near[0]}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as { features: { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }[] };
  return data.features.map(({ geometry, properties: p }) => {
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const label = p.name ?? (street || p.city || query);
    const detail = [p.name ? street : null, p.district, p.city ?? p.county, p.postcode].filter(Boolean).join(", ");
    return { label, detail, point: { lng: geometry.coordinates[0], lat: geometry.coordinates[1] } };
  });
}
