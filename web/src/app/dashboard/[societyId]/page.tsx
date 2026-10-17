import type { Metadata } from "next";
import Link from "next/link";
import { requireManagedSociety } from "@/lib/society";
import { formatEventTime, hasEnded, isLive, nowMs } from "@/lib/time";
import { categoryLabel, type MotiveEvent } from "@/lib/types";
import { SocietyForm } from "./society-form";
import { updateSociety } from "./actions";

export const metadata: Metadata = { title: "Manage society" };

export default async function SocietyDashboard({ params, searchParams }: PageProps<"/dashboard/[societyId]">) {
  const { societyId } = await params;
  const { posted } = await searchParams;
  const { supabase, society } = await requireManagedSociety(societyId);

  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("society_id", societyId)
    .order("starts_at", { ascending: true });
  const events = (data ?? []) as MotiveEvent[];
  const { count: pendingCount } = await supabase
    .from("society_members")
    .select("user_id", { count: "exact", head: true })
    .eq("society_id", societyId)
    .eq("status", "pending");

  const now = nowMs();
  const upcoming = events.filter((e) => !hasEnded(e.ends_at, now));
  const past = events.filter((e) => hasEnded(e.ends_at, now)).reverse();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/dashboard" className="text-sm font-semibold text-muted hover:text-ink">← Your societies</Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{society.name}</h1>
        <div className="flex gap-2">
          <Link href={`/dashboard/${societyId}/members`} className="btn-ghost">
            Members{pendingCount ? ` · ${pendingCount} waiting` : ""}
          </Link>
          <Link href={`/dashboard/${societyId}/events/new`} className="btn">+ Post an event</Link>
        </div>
      </div>

      {posted && (
        <p className="mt-6 rounded-xl bg-ok/10 px-4 py-3 font-semibold text-ok">
          Your event is live on Motive. Share its link to get more people going.
        </p>
      )}

      <section className="mt-8">
        <h2 className="font-display text-xl font-bold">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-muted">No upcoming events. Post one and it appears on the map straight away.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {upcoming.map((event) => <EventRow key={event.id} event={event} live={isLive(event.starts_at, event.ends_at, now)} />)}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-bold">Past</h2>
          <ul className="mt-3 space-y-3 opacity-70">
            {past.slice(0, 20).map((event) => <EventRow key={event.id} event={event} live={false} />)}
          </ul>
        </section>
      )}

      <section className="mt-12">
        <h2 className="font-display text-xl font-bold">Society details</h2>
        <p className="mt-1 mb-4 text-muted">
          Shown on your public page:{" "}
          <Link href={`/s/${society.slug}`} className="font-semibold text-brand">/s/{society.slug}</Link>
        </p>
        <div className="card">
          <SocietyForm action={updateSociety.bind(null, societyId)} society={society} />
        </div>
      </section>
    </div>
  );
}

function EventRow({ event, live }: { event: MotiveEvent; live: boolean }) {
  return (
    <li className="card flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {live && <span className="rounded-full bg-live px-2 py-0.5 text-xs font-bold text-white">LIVE</span>}
          {event.is_cancelled && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-bold text-danger">Cancelled</span>}
          {event.is_hidden && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-bold text-danger">Hidden by Motive</span>}
          <h3 className="font-display text-lg font-bold">{event.title}</h3>
        </div>
        <p className="text-sm text-muted">
          {formatEventTime(event.starts_at, event.ends_at)} · {categoryLabel(event.category)}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="font-display text-2xl font-extrabold leading-none">{event.going_count}</p>
          <p className="text-xs text-muted">going</p>
        </div>
        <Link href={`/e/${event.id}`} className="text-sm font-semibold text-muted hover:text-ink">View</Link>
        <Link href={`/dashboard/${event.society_id}/events/${event.id}/edit`} className="text-sm font-semibold text-muted hover:text-ink">Edit</Link>
        <Link href={`/dashboard/${event.society_id}/events/${event.id}`} className="text-sm font-semibold text-brand">Manage</Link>
      </div>
    </li>
  );
}
