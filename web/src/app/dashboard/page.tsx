import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatEventTime, nowMs } from "@/lib/time";
import type { MotiveEvent, Society } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: admins }, { data: claims }] = await Promise.all([
    supabase.from("society_admins").select("societies(*)").eq("user_id", profile.id),
    supabase
      .from("society_claims")
      .select("id, status, created_at, societies(name)")
      .eq("user_id", profile.id)
      .in("status", ["pending", "rejected"])
      .order("created_at", { ascending: false }),
  ]);

  const [{ data: memberships }, { data: myEntries }] = await Promise.all([
    supabase.from("society_members").select("status, societies(id, name, slug)").eq("user_id", profile.id),
    supabase
      .from("event_entries")
      .select("status, events(id, title, starts_at, ends_at)")
      .eq("user_id", profile.id),
  ]);
  const now = nowMs();
  const upcoming = (myEntries ?? [])
    .map((e) => ({ status: e.status as string, event: e.events as unknown as Pick<MotiveEvent, "id" | "title" | "starts_at" | "ends_at"> | null }))
    .filter((e): e is { status: string; event: Pick<MotiveEvent, "id" | "title" | "starts_at" | "ends_at"> } => !!e.event && new Date(e.event.ends_at).getTime() > now)
    .sort((a, b) => a.event.starts_at.localeCompare(b.event.starts_at));
  const memberOf = (memberships ?? [])
    .map((m) => ({ status: m.status as string, society: m.societies as unknown as Pick<Society, "id" | "name" | "slug"> | null }))
    .filter((m): m is { status: string; society: Pick<Society, "id" | "name" | "slug"> } => !!m.society);

  const societies = (admins ?? [])
    .map((row) => row.societies as unknown as Society | null)
    .filter((s): s is Society => s !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Hi{profile.display_name ? `, ${profile.display_name.split(" ")[0]}` : ""}</h1>
      <p className="mt-1 text-muted">Signed in as {profile.email}</p>

      {upcoming.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-bold">Your upcoming events</h2>
          <ul className="mt-3 space-y-2">
            {upcoming.map(({ status, event }) => (
              <li key={event.id}>
                <Link href={`/e/${event.id}`} className="card flex items-center justify-between gap-3 py-3 transition hover:border-brand">
                  <span>
                    <span className="block font-bold">{event.title}</span>
                    <span className="text-sm text-muted">{formatEventTime(event.starts_at, event.ends_at)}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${status === "going" ? "bg-ok/10 text-ok" : "bg-brand-soft text-brand"}`}>
                    {status === "going" ? "Going" : "Waiting list"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {memberOf.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-bold">Member of</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {memberOf.map(({ status, society }) => (
              <li key={society.id}>
                <Link href={`/s/${society.slug}`} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 font-semibold hover:border-brand">
                  {society.name}
                  {status === "pending" && <span className="text-xs font-bold text-muted">· awaiting approval</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mt-10 font-display text-xl font-bold">Societies you run</h2>

      <div className="mt-3 space-y-3">
        {societies.map((society) => (
          <Link
            key={society.id}
            href={`/dashboard/${society.id}`}
            className="card flex items-center justify-between gap-4 transition hover:border-brand"
          >
            <span className="font-display text-lg font-bold">{society.name}</span>
            <span className="text-sm font-semibold text-brand">Manage →</span>
          </Link>
        ))}

        {societies.length === 0 && (
          <div className="card">
            <p className="text-muted">
              On a committee? Ask to manage your society&apos;s page and we&apos;ll approve it once we&apos;ve checked.
            </p>
          </div>
        )}
      </div>

      {(claims ?? []).length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-lg font-bold">Your requests</h2>
          <ul className="mt-3 space-y-2">
            {claims!.map((claim) => (
              <li key={claim.id} className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
                <span>{(claim.societies as unknown as { name: string } | null)?.name}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    claim.status === "pending" ? "bg-brand-soft text-brand" : "bg-danger/10 text-danger"
                  }`}
                >
                  {claim.status === "pending" ? "Waiting for approval" : "Not approved"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link href="/dashboard/claim" className="btn-ghost mt-8">
        + Request to manage a society
      </Link>
    </div>
  );
}
