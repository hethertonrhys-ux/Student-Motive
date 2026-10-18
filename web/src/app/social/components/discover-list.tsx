"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { matchesDiscover, type MemberStatus, type SocialEvent } from "@/lib/social-events";
import { EventCard } from "./event-card";

// Discover results. Every upcoming event is already here, so search and
// filters just narrow the list on the phone: no waiting for the server.
export function DiscoverList({
  events,
  status,
  hosts,
  whenText,
  now,
  loggedIn,
}: {
  whenText: Record<string, string>;
  events: SocialEvent[];
  status: Record<string, MemberStatus>;
  hosts: Record<string, { name: string; avatar_url: string | null }>;
  now: number;
  loggedIn: boolean;
}) {
  const params = useSearchParams();
  const filters = {
    category: params.get("category") ?? "",
    date: params.get("date") ?? "",
    type: params.get("type") ?? "",
    available: params.get("available") === "1",
    q: params.get("q") ?? "",
  };
  const filtered = Boolean(filters.category || filters.date || filters.type || filters.available || filters.q.trim());
  const shown = events.filter((e) => matchesDiscover(e, filters, now));

  if (shown.length === 0) {
    return (
      <div className="card py-10 text-center">
        <p className="font-semibold">{filtered ? "Nothing matches those filters. Try clearing some." : "No events yet. Be the first to host one!"}</p>
        {!filtered && <Link href={loggedIn ? "/social/new" : "/login?next=/social/new"} className="btn mt-4">Host an event</Link>}
      </div>
    );
  }
  return (
    <>
      {shown.map((e) => (
        <EventCard key={e.id} event={e} host={hosts[e.host_id]} status={status[e.id]} whenText={whenText[e.id]} />
      ))}
    </>
  );
}
