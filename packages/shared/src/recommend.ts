import type { SupabaseClient } from "@supabase/supabase-js";
import type { FilterContext } from "./event-filters";
import { FEED_EVENT_SELECT, feedItemFromEvent, type FeedEventRow, type FeedItem } from "./events";
import { getCards, type PersonCard } from "./social";
import { SOCIAL_EVENT_FIELDS, type SocialEvent } from "./social-events";
import { nowMs } from "./time";
import { uniShort } from "./universities";

// Recommended events: simple rules, no machine learning. The database only
// supplies the facts (signals); everything about how they're weighed is in
// RECOMMEND_WEIGHTS and scoreEvent below, so improving it later is one
// small change here and nowhere else.

export const RECOMMEND_DAYS = 14;
export const RECOMMEND_LIMIT = 20;

// What the scoring looks at for one event.
export type RecommendSignals = {
  sameUni: boolean; // the society's uni, or the host's, is yours
  memberOfSociety: boolean; // you're a member of (or run) the society
  friendHosting: boolean; // an accepted friend is hosting it
  friendsGoing: number; // how many of your friends are going
  going: number; // everyone going
  hoursUntil: number; // from now until it starts
};

export const RECOMMEND_WEIGHTS = {
  memberOfSociety: 5,
  friendHosting: 4,
  friendGoing: 2, // per friend going, up to friendsGoingCap friends
  friendsGoingCap: 3,
  sameUni: 2,
  popularity: 1.5, // times log10(going + 1): 9 going adds 1.5, 99 going adds 3
  soon: 3, // full marks for starting now, fading to nothing at soonHorizonHours
  soonHorizonHours: RECOMMEND_DAYS * 24,
  popularFrom: 10, // "Popular" is said from this many going
};

export function scoreEvent(s: RecommendSignals, w = RECOMMEND_WEIGHTS): number {
  let score = 0;
  if (s.memberOfSociety) score += w.memberOfSociety;
  if (s.friendHosting) score += w.friendHosting;
  score += Math.min(Math.max(0, s.friendsGoing), w.friendsGoingCap) * w.friendGoing;
  if (s.sameUni) score += w.sameUni;
  score += w.popularity * Math.log10(Math.max(0, s.going) + 1);
  score += w.soon * Math.max(0, 1 - Math.max(0, s.hoursUntil) / w.soonHorizonHours);
  return score;
}

// Why it's recommended, in the order shown ("Your society · 2 friends going").
// `uniReason` is the fallback for an event with no personal signal beyond
// being from your uni (worded by the caller: "LSE society", "LSE student hosting").
export function reasonsFor(s: RecommendSignals, uniReason: string | null, w = RECOMMEND_WEIGHTS): string[] {
  const reasons: string[] = [];
  if (s.memberOfSociety) reasons.push("Your society");
  if (s.friendHosting) reasons.push("A friend is hosting");
  if (s.friendsGoing > 0) reasons.push(s.friendsGoing === 1 ? "1 friend going" : `${s.friendsGoing} friends going`);
  if (s.going >= w.popularFrom) reasons.push("Popular");
  if (reasons.length === 0 && s.sameUni && uniReason) reasons.push(uniReason);
  return reasons.slice(0, 2);
}

export type Recommendation<E> = { event: E; score: number; reasons: string[]; signals: RecommendSignals };

type Signal = { kind: "society" | "social"; event_id: string; hosting: boolean; going: number };

// How many of your friends are hosting or going, per event. The database
// returns counts only, for events you can already see.
async function friendSignals(supabase: SupabaseClient, societyIds: string[], socialIds: string[]): Promise<Map<string, Signal>> {
  if (societyIds.length === 0 && socialIds.length === 0) return new Map();
  const { data, error } = await supabase.rpc("my_friend_event_signals", { society_ids: societyIds, social_ids: socialIds });
  if (error) throw error;
  return new Map(((data ?? []) as Signal[]).map((s) => [`${s.kind}:${s.event_id}`, s]));
}

// Every candidate with a reason, best first. Screens apply their own filters and then keep the top RECOMMEND_LIMIT.
function rank<E>(events: E[], signalsOf: (e: E) => RecommendSignals, uniReason: string | null, startOf: (e: E) => string): Recommendation<E>[] {
  return events
    .map((event) => {
      const signals = signalsOf(event);
      return { event, score: scoreEvent(signals), reasons: reasonsFor(signals, uniReason), signals };
    })
    .filter((r) => r.reasons.length > 0)
    .sort((a, b) => b.score - a.score || startOf(a.event).localeCompare(startOf(b.event)));
}

// All upcoming society events (the "All" side of the switch): soonest first, no reasons.
export type SocietyEventsForYou = { all: FeedItem[]; recommended: Recommendation<FeedItem>[] };

export type Me = { id: string; university: string | null };

const hoursUntil = (iso: string, now: number) => (new Date(iso).getTime() - now) / 3_600_000;

// Society events (and student-hosted ones on the events table) for the
// Societies tab: every upcoming one, and the recommended subset. Events
// you're already going to or hosting are left out of both.
export async function loadSocietyRecommendations(supabase: SupabaseClient, me: Me, who: FilterContext): Promise<SocietyEventsForYou> {
  const now = nowMs();
  const from = new Date(now).toISOString();
  const until = new Date(now + RECOMMEND_DAYS * 86_400_000).toISOString();
  const [{ data }, { data: mine }] = await Promise.all([
    supabase.from("events").select(FEED_EVENT_SELECT).eq("is_cancelled", false).gt("ends_at", from).lt("starts_at", until).order("starts_at").limit(300),
    supabase.from("event_entries").select("event_id").eq("user_id", me.id),
  ]);
  const joined = new Set((mine ?? []).map((r) => r.event_id as string));
  const rows = ((data ?? []) as unknown as FeedEventRow[]).filter((r) => !joined.has(r.id) && r.host_user_id !== me.id);
  const [hosts, signals] = await Promise.all([
    getCards(supabase, rows.map((r) => r.host_user_id).filter((x): x is string => !!x)),
    friendSignals(supabase, rows.map((r) => r.id), []),
  ]);
  const items = rows.map((r) => feedItemFromEvent(r, hosts, me.university));
  const recommended = rank(
    items,
    (e) => {
      const s = signals.get(`society:${e.id}`);
      return {
        sameUni: !!e.university && e.university === me.university,
        memberOfSociety: !!e.societyId && who.societyIds.has(e.societyId),
        friendHosting: (!!e.hostId && who.friendIds.has(e.hostId)) || !!s?.hosting,
        friendsGoing: s?.going ?? 0,
        going: e.going,
        hoursUntil: hoursUntil(e.startsAt, now),
      };
    },
    me.university ? `${uniShort(me.university)} society` : null,
    (e) => e.startsAt,
  );
  return { all: items, recommended };
}

// Students' Social plans for the Social tab. Plans you host or have already
// joined (or asked to join) are left out.
export async function loadSocialRecommendations(supabase: SupabaseClient, me: Me, who: FilterContext): Promise<{ items: Recommendation<SocialEvent>[]; hosts: Map<string, PersonCard> }> {
  const now = nowMs();
  const from = new Date(now).toISOString();
  const until = new Date(now + RECOMMEND_DAYS * 86_400_000).toISOString();
  const [{ data }, { data: mine }] = await Promise.all([
    supabase.from("social_events").select(SOCIAL_EVENT_FIELDS).eq("is_cancelled", false).neq("host_id", me.id).gt("ends_at", from).lt("starts_at", until).order("starts_at").limit(300),
    supabase.from("social_event_members").select("event_id").eq("user_id", me.id),
  ]);
  const joined = new Set((mine ?? []).map((r) => r.event_id as string));
  const events = ((data ?? []) as SocialEvent[]).filter((e) => !joined.has(e.id));
  const [hosts, signals] = await Promise.all([getCards(supabase, events.map((e) => e.host_id)), friendSignals(supabase, [], events.map((e) => e.id))]);
  const items = rank(
    events,
    (e) => {
      const s = signals.get(`social:${e.id}`);
      const host = hosts.get(e.host_id);
      return {
        sameUni: !!host?.university && host.university === me.university,
        memberOfSociety: false,
        friendHosting: who.friendIds.has(e.host_id) || !!s?.hosting,
        friendsGoing: s?.going ?? 0,
        going: e.going_count + 1,
        hoursUntil: hoursUntil(e.starts_at, now),
      };
    },
    me.university ? `${uniShort(me.university)} student hosting` : null,
    (e) => e.starts_at,
  );
  return { items, hosts };
}
