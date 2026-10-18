import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatEventTime, nowMs } from "@/lib/time";
import type { MotiveEvent, Society } from "@/lib/types";
import { SocietySearch, type SearchableSociety } from "../dashboard/society-search";

export const metadata: Metadata = { title: "Societies" };

// The Societies tab: find societies, your memberships, the ones you run and
// your upcoming society events. It only reads Societies data.
export default async function SocietiesPage() {
  const me = await getProfile();
  const supabase = await createClient();

  const [{ data: all }, mine] = await Promise.all([
    supabase.from("societies").select("id, name, slug, kind, logo_url").order("name").limit(2000),
    me
      ? Promise.all([
          supabase.from("society_admins").select("societies(id, name, slug, logo_url)").eq("user_id", me.id),
          supabase.from("society_members").select("status, societies(id, name, slug, logo_url)").eq("user_id", me.id),
          supabase
            .from("event_entries")
            .select("status, events(id, title, starts_at, ends_at, society_id, societies(name))")
            .eq("user_id", me.id),
        ])
      : null,
  ]);

  type Lite = Pick<Society, "id" | "name" | "slug" | "logo_url">;
  const runs = ((mine?.[0].data ?? []) as unknown as { societies: Lite | null }[])
    .map((r) => r.societies)
    .filter((s): s is Lite => !!s)
    .sort((a, b) => a.name.localeCompare(b.name));
  const memberships = ((mine?.[1].data ?? []) as unknown as { status: string; societies: Lite | null }[]).filter(
    (m): m is { status: string; societies: Lite } => !!m.societies,
  );
  const now = nowMs();
  const upcoming = ((mine?.[2].data ?? []) as unknown as {
    status: string;
    events: (Pick<MotiveEvent, "id" | "title" | "starts_at" | "ends_at" | "society_id"> & { societies: { name: string } | null }) | null;
  }[])
    .filter((e) => e.events && e.events.society_id && new Date(e.events.ends_at).getTime() > now)
    .sort((a, b) => a.events!.starts_at.localeCompare(b.events!.starts_at));

  const runIds = new Set(runs.map((s) => s.id));
  const memberStatus = new Map(memberships.map((m) => [m.societies.id, m.status]));
  const searchable: SearchableSociety[] = ((all ?? []) as Omit<SearchableSociety, "relation">[]).map((s) => ({
    ...s,
    relation: runIds.has(s.id) ? "runs" : memberStatus.get(s.id) === "approved" ? "member" : memberStatus.has(s.id) ? "pending" : null,
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Societies</h1>
      <p className="text-sm text-muted">Every LSE society, hall and more in one place.</p>

      <div className="-mt-2">
        <SocietySearch societies={searchable} />
      </div>

      {upcoming.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-bold">Your upcoming events</h2>
          <ul className="mt-3 space-y-2">
            {upcoming.map(({ status, events: e }) => (
              <li key={e!.id}>
                <Link href={`/e/${e!.id}`} className="card flex items-center justify-between gap-3 py-3 transition hover:border-brand">
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{e!.title}</span>
                    <span className="text-sm text-muted">
                      {formatEventTime(e!.starts_at, e!.ends_at)}
                      {e!.societies ? ` · ${e!.societies.name}` : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${status === "going" ? "bg-ok/10 text-ok" : "bg-brand-soft text-brand"}`}>
                    {status === "going" ? "Going" : status === "requested" ? "Requested" : "Waiting list"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {memberships.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-bold">Your societies</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {memberships.map(({ status, societies: s }) => (
              <li key={s.id}>
                <Link href={`/s/${s.slug}`} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3.5 pl-1 font-semibold hover:border-brand">
                  <Avatar name={s.name} url={s.logo_url} size={26} />
                  {s.name}
                  {status === "pending" && <span className="text-xs font-bold text-muted">· awaiting approval</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {me && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-bold">Societies you run</h2>
          <div className="mt-3 space-y-3">
            {runs.map((s) => (
              <Link key={s.id} href={`/dashboard/${s.id}`} className="card flex items-center justify-between gap-4 transition hover:border-brand">
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar name={s.name} url={s.logo_url} size={36} />
                  <span className="truncate font-display text-lg font-bold">{s.name}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-brand">Manage →</span>
              </Link>
            ))}
            {runs.length === 0 && (
              <p className="card text-muted">On a committee? Ask to manage your society&apos;s page and we&apos;ll approve it once we&apos;ve checked.</p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/dashboard/claim" className="btn-ghost">+ Request to manage a society</Link>
            <Link href="/dashboard" className="btn-ghost">Society dashboard</Link>
          </div>
        </section>
      )}

      {!me && (
        <div className="card mt-8 flex flex-wrap items-center justify-between gap-3">
          <p className="font-semibold">Log in to see your societies.</p>
          <Link href="/login?next=/societies" className="btn">Log in</Link>
        </div>
      )}
    </div>
  );
}
