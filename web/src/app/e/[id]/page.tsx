import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicEvent } from "@/lib/public-events";
import { SITE_URL } from "@/lib/site";
import { formatEventTime, hasEnded, isLive } from "@/lib/time";
import { categoryLabel } from "@/lib/types";
import { ShareButton } from "@/components/share-button";
import { Participation } from "./participation";
import { HostedPanel } from "./hosted-panel";
import { getCards } from "@/lib/social";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/avatar";

export async function generateMetadata({ params }: PageProps<"/e/[id]">): Promise<Metadata> {
  const { id } = await params;
  const event = await getPublicEvent(id);
  if (!event) return { title: "Event not found" };

  const when = formatEventTime(event.starts_at, event.ends_at);
  const place = event.venues?.name ?? event.location_note ?? "";
  const description = `${when} · ${place}${event.societies ? ` · ${event.societies.name}` : ""}`;
  return {
    title: event.title,
    description,
    openGraph: {
      title: event.title,
      description,
      type: "website",
      ...(event.image_url ? { images: [event.image_url] } : {}),
    },
  };
}

export default async function EventPage({ params, searchParams }: PageProps<"/e/[id]">) {
  const { id } = await params;
  const { hosted: justPosted } = await searchParams;
  const event = await getPublicEvent(id);
  if (!event) notFound();

  // Student-hosted events: who's hosting, and the exact address if you're allowed to see it.
  const hosted = Boolean(event.host_user_id);
  let host = null;
  let exact: { address: string | null; lat: number | null; lng: number | null } | null = null;
  if (hosted) {
    const supabase = await createClient();
    const [cards, { data }] = await Promise.all([
      getCards(supabase, [event.host_user_id!]),
      supabase.from("event_private_details").select("address, lat, lng").eq("event_id", event.id).maybeSingle(),
    ]);
    host = cards.get(event.host_user_id!) ?? null;
    exact = data;
  }

  const earlyStart = (event.event_tables ?? []).some((t) => t.started_at) && !hasEnded(event.ends_at);
  const live = !event.is_cancelled && (isLive(event.starts_at, event.ends_at) || earlyStart);
  const finished = hasEnded(event.ends_at);
  const venue = event.venues;
  // Either a listed venue, or a custom pin named by the location note.
  const pin = venue
    ? { lat: venue.lat, lng: venue.lng }
    : exact?.lat != null && exact?.lng != null
      ? { lat: exact.lat, lng: exact.lng }
      : event.lat != null && event.lng != null
        ? { lat: event.lat, lng: event.lng }
        : null;
  // For hosted events, only link to directions once you can see the exact spot.
  const mapsUrl = pin && (!hosted || exact) ? `https://www.google.com/maps/search/?api=1&query=${pin.lat},${pin.lng}` : null;

  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      {event.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.image_url} alt="" className="mb-6 aspect-[16/9] w-full rounded-2xl object-cover" />
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
        {live && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-live px-2.5 py-0.5 text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-white" /> LIVE NOW
          </span>
        )}
        {event.is_cancelled && <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-danger">Cancelled</span>}
        {finished && !event.is_cancelled && <span className="rounded-full bg-line px-2.5 py-0.5 text-muted">Finished</span>}
        <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-brand">{categoryLabel(event.category)}</span>
        {event.free_food && <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-brand">Free food 🍕</span>}
        {hosted && event.visibility === "friends" && <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-brand">👥 Friends only</span>}
      </div>

      <h1 className="mt-3 font-display text-4xl font-extrabold leading-tight tracking-tight">{event.title}</h1>

      {event.societies && (
        <Link href={`/s/${event.societies.slug}`} className="mt-2 inline-block font-semibold text-brand">
          {event.societies.name}
        </Link>
      )}
      {host && (
        <Link href={`/u/${host.id}`} className="mt-3 inline-flex items-center gap-2 font-semibold">
          <Avatar name={host.name} url={host.avatar_url} size={28} />
          <span>Hosted by <span className="text-brand">{host.name}</span></span>
        </Link>
      )}
      {justPosted && hosted && (
        <p className="mt-4 rounded-2xl bg-ok/10 px-4 py-3 text-sm font-semibold text-ok">
          ✓ Your event is up{event.visibility === "friends" ? " for your friends to see" : " on the live map"}. Share the link to invite people.
        </p>
      )}

      <dl className="card mt-6 space-y-4">
        <div>
          <dt className="text-sm font-semibold text-muted">When</dt>
          <dd className="font-semibold">{formatEventTime(event.starts_at, event.ends_at)}</dd>
        </div>
        {(venue || pin) && (
          <div>
            <dt className="text-sm font-semibold text-muted">Where</dt>
            <dd className="font-semibold">
              {venue ? (
                <>
                  {venue.name}
                  {event.location_note && <span className="font-normal"> · {event.location_note}</span>}
                </>
              ) : (
                event.location_note || "See the map"
              )}
            </dd>
            {venue?.address && <dd className="text-sm text-muted">{venue.address}</dd>}
            {hosted && (exact?.address ? (
              <dd className="text-sm">📍 {exact.address}</dd>
            ) : (
              <dd className="text-sm text-muted">The exact address is shared with people going.</dd>
            ))}
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand">
                Open in Maps →
              </a>
            )}
          </div>
        )}
        <div>
          <dt className="text-sm font-semibold text-muted">{event.format === "entries" && !hosted ? "Entered" : "Going"}</dt>
          <dd className="font-semibold">{event.going_count} {event.going_count === 1 ? "person" : "people"}</dd>
        </div>
      </dl>

      {hosted ? (
        <HostedPanel event={event} host={host} />
      ) : (
        <Participation event={event} society={event.societies ? { name: event.societies.name, slug: event.societies.slug } : null} />
      )}

      {event.description && <p className="mt-6 whitespace-pre-line text-lg leading-relaxed">{event.description}</p>}

      <div className="mt-8 flex flex-wrap gap-3">
        {event.ticket_url && (
          <a href={event.ticket_url} target="_blank" rel="noopener noreferrer" className="btn">
            Tickets / sign up
          </a>
        )}
        <ShareButton url={`${SITE_URL}/e/${event.id}`} title={event.title} />
      </div>

      <div className="card mt-10 bg-brand-soft">
        <p className="font-display text-lg font-bold">See everything on at LSE tonight</p>
        <p className="text-muted">Every society event on one live map.</p>
        <Link href="/map" className="mt-2 inline-block font-semibold text-brand">Open the live map →</Link>
      </div>
    </article>
  );
}
