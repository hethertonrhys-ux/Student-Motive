import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { requireProfile } from "@/lib/auth";
import { promptsFor } from "@/lib/prompts";
import { createClient } from "@/lib/supabase/server";
import { formatEventTime, nowMs } from "@/lib/time";
import {
  DEFAULT_UNI,
  SHOW_EVENT_COUNT_FROM,
  SHOW_SOCIETY_COUNT_FROM,
  otherUnisText,
  uniById,
  uniFromEmail,
  uniShort,
} from "@/lib/universities";
import { UniPicker } from "./uni-picker";
import { WelcomePrompt } from "./welcome-prompt";

export const metadata: Metadata = { title: "Welcome" };

type Upcoming = { id: string; title: string; starts_at: string; ends_at: string; href: string; by: string };

// Straight after signing up: one optional prompt, then into the app. Also
// says hello from their uni, suggests its societies and shows what's coming
// up (their uni's events first, then ones open to all London students).
export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const me = await requireProfile();
  const { next } = await searchParams;
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const uni = uniById(me.university) ?? uniById(DEFAULT_UNI)!;
  // Two truths and a lie takes the most effort, so it's further down here.
  const offered = promptsFor(uni.id);
  const effortful = offered.filter((p) => p.game);
  const quick = offered.filter((p) => !p.game);
  const list = [...quick.slice(0, 6), ...effortful, ...quick.slice(6)];

  const supabase = await createClient();
  const now = new Date(nowMs()).toISOString();
  const eventFields = "id, title, starts_at, ends_at, societies!inner(name, university)";
  const [societies, societyCount, ownEvents, eventCount, londonEvents, socials] = await Promise.all([
    supabase.from("societies").select("id, name, slug, logo_url").eq("university", uni.id).eq("kind", "society").order("is_verified", { ascending: false }).order("name").limit(8),
    supabase.from("societies").select("id", { count: "exact", head: true }).eq("university", uni.id).eq("kind", "society"),
    supabase.from("events").select(eventFields).eq("societies.university", uni.id).eq("is_cancelled", false).gt("ends_at", now).order("starts_at").limit(4),
    supabase.from("events").select("id, societies!inner(university)", { count: "exact", head: true }).eq("societies.university", uni.id).eq("is_cancelled", false).gt("ends_at", now),
    supabase.from("events").select(eventFields).eq("audience", "london").neq("societies.university", uni.id).eq("is_cancelled", false).gt("ends_at", now).order("starts_at").limit(4),
    supabase.from("social_events").select("id, title, starts_at, ends_at, area").eq("is_cancelled", false).eq("friends_only", false).gt("ends_at", now).order("starts_at").limit(4),
  ]);

  type EventRow = { id: string; title: string; starts_at: string; ends_at: string; societies: { name: string; university: string } };
  const own: Upcoming[] = ((ownEvents.data ?? []) as unknown as EventRow[]).map((e) => ({ ...e, href: `/e/${e.id}`, by: e.societies.name }));
  const open: Upcoming[] = [
    ...((londonEvents.data ?? []) as unknown as EventRow[]).map((e) => ({ ...e, href: `/e/${e.id}`, by: `${e.societies.name} · ${uniShort(e.societies.university)}` })),
    ...((socials.data ?? []) as { id: string; title: string; starts_at: string; ends_at: string; area: string }[]).map((e) => ({ ...e, href: `/social/${e.id}`, by: `Social · ${e.area}` })),
  ].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const upcoming = [...own, ...open].slice(0, 5);

  const counts = [
    (societyCount.count ?? 0) >= SHOW_SOCIETY_COUNT_FROM ? `${societyCount.count} societies` : null,
    (eventCount.count ?? 0) >= SHOW_EVENT_COUNT_FROM ? `${eventCount.count} events coming up` : null,
  ].filter(Boolean);
  const suggested = (societies.data ?? []) as { id: string; name: string; slug: string; logo_url: string | null }[];

  const intro = (
    <>
      <h1 className="font-display text-3xl font-extrabold tracking-tight">
        Welcome to Function at <span style={{ color: uni.accent }}>{uni.short}</span>!
      </h1>
      {/* Invited with a non-uni email: they say which uni they're at. */}
      {!uniFromEmail(me.email) && <UniPicker current={uni.id} />}
      {counts.length > 0 && <p className="mt-2 font-semibold">{counts.join(" and ")} at {uni.short}.</p>}
      {suggested.length > 0 && (
        <div className="mt-4">
          <p className="font-semibold">Find your societies at {uni.short}</p>
          <ul className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
            {suggested.map((s) => (
              <li key={s.id} className="shrink-0">
                <Link href={`/s/${s.slug}`} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3.5 pl-1 text-sm font-semibold hover:border-brand">
                  <Avatar name={s.name} url={s.logo_url} size={26} />
                  {s.name}
                </Link>
              </li>
            ))}
            <li className="shrink-0">
              <Link href="/societies" className="inline-flex h-full items-center rounded-full px-3 text-sm font-semibold text-brand">See all →</Link>
            </li>
          </ul>
        </div>
      )}
      <p className="mt-3 text-sm text-muted">Plus open socials across {otherUnisText(uni.id)}.</p>
      <p className="mt-6 text-lg">Pick one prompt so people have something to say hi about.</p>
    </>
  );

  const comingUp =
    upcoming.length > 0 ? (
      <section className="mt-8">
        <h2 className="font-display text-xl font-bold">Coming up</h2>
        <ul className="mt-3 space-y-2">
          {upcoming.map((e) => (
            <li key={e.href}>
              <Link href={e.href} className="card block py-3 transition hover:border-brand">
                <span className="block truncate font-bold">{e.title}</span>
                <span className="block truncate text-sm text-muted">
                  {formatEventTime(e.starts_at, e.ends_at)} · {e.by}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return <WelcomePrompt prompts={list} uni={uni.id} next={target} intro={intro} after={comingUp} />;
}
