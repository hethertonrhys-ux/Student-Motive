import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { JoinForm } from "./join-form";
import { leaveSociety, requestToJoin } from "./actions";
import { formatEventTime, isLive } from "@/lib/time";
import { categoryLabel, type MotiveEvent, type Society } from "@/lib/types";

const getSociety = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("societies").select("*").eq("slug", slug).maybeSingle<Society>();
  return data;
});

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const society = await getSociety(slug);
  if (!society) return { title: "Not found" };
  return {
    title: society.name,
    description: society.description ?? `Upcoming events from ${society.name} on Motive.`,
  };
}

export default async function SocietyPage({ params }: PageProps<"/s/[slug]">) {
  const { slug } = await params;
  const society = await getSociety(slug);
  if (!society) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("society_id", society.id)
    .eq("is_cancelled", false)
    .gte("ends_at", new Date().toISOString())
    .order("starts_at")
    .limit(30);
  const events = (data ?? []) as MotiveEvent[];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center gap-4">
        {society.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={society.logo_url} alt="" className="size-20 rounded-2xl object-cover" />
        ) : (
          <div className="grid size-20 place-items-center rounded-2xl bg-brand-soft font-display text-3xl font-extrabold text-brand">
            {society.name.replace(/^LSE\s+/i, "").charAt(0)}
          </div>
        )}
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">{society.name}</h1>
          <div className="mt-1 flex flex-wrap gap-3 text-sm font-semibold">
            {society.instagram && (
              <a href={`https://instagram.com/${society.instagram}`} target="_blank" rel="noopener noreferrer" className="text-brand">
                @{society.instagram}
              </a>
            )}
            {society.website && (
              <a href={society.website} target="_blank" rel="noopener noreferrer" className="text-brand">
                Website
              </a>
            )}
          </div>
        </div>
      </div>

      {society.description && <p className="mt-6 text-lg">{society.description}</p>}

      <Membership societyId={society.id} slug={society.slug} name={society.name} />

      <h2 className="mt-10 font-display text-xl font-bold">Upcoming events</h2>
      {events.length === 0 ? (
        <p className="mt-3 text-muted">Nothing coming up yet. Check back soon.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {events.map((event) => (
            <li key={event.id}>
              <Link href={`/e/${event.id}`} className="card flex items-center justify-between gap-4 transition hover:border-brand">
                <div>
                  <p className="flex items-center gap-2 font-display text-lg font-bold">
                    {isLive(event.starts_at, event.ends_at) && (
                      <span className="rounded-full bg-live px-2 py-0.5 font-sans text-xs text-white">LIVE</span>
                    )}
                    {event.title}
                  </p>
                  <p className="text-sm text-muted">
                    {formatEventTime(event.starts_at, event.ends_at)} · {categoryLabel(event.category)}
                  </p>
                </div>
                <span className="text-sm font-semibold text-muted">{event.going_count} going</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function Membership({ societyId, slug, name }: { societyId: string; slug: string; name: string }) {
  const profile = await getProfile();
  if (!profile) {
    return (
      <div className="card mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold">Members can join events and pick their table.</p>
        <Link href={`/login?next=/s/${slug}`} className="btn">Log in to join</Link>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: membership }, { data: isAdmin }] = await Promise.all([
    supabase.from("society_members").select("status").eq("society_id", societyId).eq("user_id", profile.id).maybeSingle(),
    supabase.rpc("is_society_admin", { sid: societyId }),
  ]);

  if (isAdmin) {
    return (
      <div className="card mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold">You run this society.</p>
        <Link href={`/dashboard/${societyId}`} className="btn-ghost">Open dashboard</Link>
      </div>
    );
  }
  if (membership?.status === "approved") {
    return (
      <div className="card mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold"><span className="text-ok">✓</span> You&apos;re a member of {name}</p>
        <form action={leaveSociety.bind(null, societyId, slug)}>
          <button className="text-sm font-semibold text-muted hover:text-danger">Leave</button>
        </form>
      </div>
    );
  }
  if (membership?.status === "pending") {
    return (
      <div className="card mt-6">
        <p className="font-semibold">Request sent</p>
        <p className="text-sm text-muted">The committee will approve you once they&apos;ve checked your membership.</p>
      </div>
    );
  }
  return (
    <div className="card mt-6 space-y-2">
      <p className="font-semibold">Are you a member of {name}?</p>
      <p className="text-sm text-muted">Join to enter events and pick your table. The committee approves members.</p>
      <JoinForm action={requestToJoin.bind(null, societyId, slug)} defaultName={profile.display_name ?? ""} />
    </div>
  );
}
