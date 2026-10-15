import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicEvent } from "@/lib/public-events";
import { SITE_URL } from "@/lib/site";
import { formatEventTime, hasEnded, isLive } from "@/lib/time";
import { categoryLabel } from "@/lib/types";
import { ShareButton } from "@/components/share-button";

export async function generateMetadata({ params }: PageProps<"/e/[id]">): Promise<Metadata> {
  const { id } = await params;
  const event = await getPublicEvent(id);
  if (!event) return { title: "Event not found" };

  const when = formatEventTime(event.starts_at, event.ends_at);
  const description = `${when} · ${event.venues?.name ?? ""}${event.societies ? ` · ${event.societies.name}` : ""}`;
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

export default async function EventPage({ params }: PageProps<"/e/[id]">) {
  const { id } = await params;
  const event = await getPublicEvent(id);
  if (!event) notFound();

  const live = !event.is_cancelled && isLive(event.starts_at, event.ends_at);
  const finished = hasEnded(event.ends_at);
  const venue = event.venues;
  const mapsUrl = venue ? `https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lng}` : null;

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
      </div>

      <h1 className="mt-3 font-display text-4xl font-extrabold leading-tight tracking-tight">{event.title}</h1>

      {event.societies && (
        <Link href={`/s/${event.societies.slug}`} className="mt-2 inline-block font-semibold text-brand">
          {event.societies.name}
        </Link>
      )}

      <dl className="card mt-6 space-y-4">
        <div>
          <dt className="text-sm font-semibold text-muted">When</dt>
          <dd className="font-semibold">{formatEventTime(event.starts_at, event.ends_at)}</dd>
        </div>
        {venue && (
          <div>
            <dt className="text-sm font-semibold text-muted">Where</dt>
            <dd className="font-semibold">
              {venue.name}
              {event.location_note && <span className="font-normal"> · {event.location_note}</span>}
            </dd>
            {venue.address && <dd className="text-sm text-muted">{venue.address}</dd>}
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand">
                Open in Maps →
              </a>
            )}
          </div>
        )}
        <div>
          <dt className="text-sm font-semibold text-muted">Going</dt>
          <dd className="font-semibold">{event.going_count} {event.going_count === 1 ? "person" : "people"}</dd>
        </div>
      </dl>

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
        <p className="text-muted">The Motive app shows every society event on a live map. Coming soon to iPhone and Android.</p>
      </div>
    </article>
  );
}
