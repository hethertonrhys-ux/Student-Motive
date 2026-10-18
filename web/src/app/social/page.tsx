import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getUserId } from "@/lib/auth";
import { getCards } from "@/lib/social";
import { SOCIAL_EVENT_FIELDS, formatWhen, type MemberStatus, type SocialEvent } from "@/lib/social-events";
import { createClient } from "@/lib/supabase/server";
import { nowMs } from "@/lib/time";
import { DiscoverList } from "./components/discover-list";
import { EventCard } from "./components/event-card";
import { Filters } from "./components/filters";

export const metadata: Metadata = { title: "Social", description: "Students hosting their own plans: sport, study, socials and nights out." };

type Tab = "discover" | "hosting" | "going";

export default async function SocialPage({ searchParams }: PageProps<"/social">) {
  const params = await searchParams;
  const str = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  // Just your id: checked on our own server, with no database trip.
  const myId = await getUserId();
  const me = myId ? { id: myId } : null;
  const tab: Tab = me && (str("tab") === "hosting" || str("tab") === "going") ? (str("tab") as Tab) : "discover";
  const supabase = await createClient();
  const now = nowMs();
  const nowIso = new Date(now).toISOString();

  // Requests waiting on events you host, for the Hosting tab's red number.
  // Started now so it loads at the same time as everything else.
  const badge = me
    ? supabase
        .from("social_event_members")
        .select("event_id, social_events!inner(host_id, ends_at, is_cancelled)", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("social_events.host_id", me.id)
        .eq("social_events.is_cancelled", false)
        .gt("social_events.ends_at", nowIso)
    : null;

  let events: SocialEvent[] = [];
  const status = new Map<string, MemberStatus>();
  const pending = new Map<string, number>();

  if (tab === "discover") {
    // Every upcoming event; search and filters then work on the phone.
    let query = supabase
      .from("social_events")
      .select(SOCIAL_EVENT_FIELDS)
      .eq("is_cancelled", false)
      .gt("ends_at", nowIso)
      .order("starts_at")
      .limit(200);
    if (me) query = query.neq("host_id", me.id);
    const [{ data }, { data: mine }] = await Promise.all([
      query,
      me ? supabase.from("social_event_members").select("event_id, status").eq("user_id", me.id) : Promise.resolve({ data: [] }),
    ]);
    events = (data ?? []) as SocialEvent[];
    for (const m of mine ?? []) status.set(m.event_id, m.status as MemberStatus);
  } else if (tab === "hosting" && me) {
    const { data } = await supabase
      .from("social_events")
      .select(SOCIAL_EVENT_FIELDS)
      .eq("host_id", me.id)
      .gt("ends_at", new Date(now - 86400e3).toISOString())
      .order("starts_at");
    events = (data ?? []) as SocialEvent[];
    if (events.length) {
      const { data: reqs } = await supabase.from("social_event_members").select("event_id").eq("status", "pending").in("event_id", events.map((e) => e.id));
      for (const r of reqs ?? []) pending.set(r.event_id, (pending.get(r.event_id) ?? 0) + 1);
    }
  } else if (tab === "going" && me) {
    const { data } = await supabase
      .from("social_event_members")
      .select(`status, social_events(${SOCIAL_EVENT_FIELDS})`)
      .eq("user_id", me.id);
    for (const row of data ?? []) {
      const ev = row.social_events as unknown as SocialEvent | null;
      if (!ev || new Date(ev.ends_at).getTime() < now - 86400e3) continue;
      events.push(ev);
      status.set(ev.id, row.status as MemberStatus);
    }
    events.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }

  const [hosts, badgeResult] = await Promise.all([getCards(supabase, events.map((e) => e.host_id)), badge]);
  const totalPending = [...pending.values()].reduce((a, b) => a + b, 0);
  const hostingBadge = tab === "hosting" ? totalPending : (badgeResult?.count ?? 0);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Social</h1>
          <p className="text-sm text-muted">Plans hosted by students. Join one or start your own.</p>
        </div>
        <Link href={me ? "/social/new" : "/login?next=/social/new"} className="btn shrink-0">+ Host</Link>
      </div>

      {/* Tabs */}
      <nav className="mt-6 grid grid-cols-3 rounded-2xl border border-line bg-surface p-1 text-sm font-bold">
        {(["discover", "hosting", "going"] as const).map((t) => (
          <Link
            key={t}
            href={me || t === "discover" ? `/social?tab=${t}` : `/login?next=/social?tab=${t}`}
            className={`relative rounded-xl py-2.5 text-center transition ${tab === t ? "bg-brand text-brand-ink shadow" : "text-muted hover:text-ink"}`}
          >
            {t === "discover" ? "Discover" : t === "hosting" ? "Hosting" : "Going"}
            {t === "hosting" && hostingBadge > 0 && (
              <span className="absolute top-1 right-2 grid min-w-[18px] place-items-center rounded-full bg-live px-1 text-[10px] leading-[18px] text-white">
                {hostingBadge}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {tab === "discover" && (
        <div className="mt-5">
          <Suspense>
            <Filters />
          </Suspense>
        </div>
      )}

      {tab === "hosting" && totalPending > 0 && (
        <p className="mt-5 rounded-2xl bg-live/10 px-4 py-3 text-sm font-semibold text-live">
          {totalPending} {totalPending === 1 ? "person is" : "people are"} waiting for your answer.
        </p>
      )}

      <div className="mt-5 space-y-3">
        {tab === "discover" ? (
          <Suspense>
            <DiscoverList
              events={events}
              status={Object.fromEntries(status)}
              hosts={Object.fromEntries([...hosts].map(([id, h]) => [id, { name: h.name, avatar_url: h.avatar_url }]))}
              whenText={Object.fromEntries(events.map((e) => [e.id, formatWhen(e.starts_at)]))}
              now={now}
              loggedIn={Boolean(me)}
            />
          </Suspense>
        ) : (
          <>
            {events.map((e) => (
              <EventCard key={e.id} event={e} host={tab === "hosting" ? null : hosts.get(e.host_id)} status={status.get(e.id)} pending={pending.get(e.id)} />
            ))}
            {events.length === 0 && <Empty tab={tab} />}
          </>
        )}
      </div>
    </div>
  );
}

function Empty({ tab }: { tab: Exclude<Tab, "discover"> }) {
  return (
    <div className="card py-10 text-center">
      <p className="font-semibold">{tab === "hosting" ? "You're not hosting anything yet." : "You haven't joined anything yet. Have a look in Discover."}</p>
      {tab === "hosting" ? <Link href="/social/new" className="btn mt-4">Host an event</Link> : <Link href="/social" className="btn mt-4">Discover events</Link>}
    </div>
  );
}
