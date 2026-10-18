import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { ShareButton } from "@/components/share-button";
import { getUserId } from "@/lib/auth";
import { getCards } from "@/lib/social";
import { SOCIAL_EVENT_FIELDS, categoryInfo, formatWhen, spacesLeft, type MemberStatus, type SocialEvent } from "@/lib/social-events";
import { SITE_URL } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { nowMs } from "@/lib/time";
import { removeGuest, respondToRequest } from "../actions";
import { Attendees } from "../components/attendees";
import { InstantRow, JoinPanel } from "../components/join-panel";
import { ReportLink } from "../components/report-link";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/London" }).format(new Date(iso));

// Loaded once per page, shared by the page title and the page itself.
const load = cache(async (id: string) => {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("social_events").select(SOCIAL_EVENT_FIELDS).eq("id", id).maybeSingle();
  return data as SocialEvent | null;
});

export async function generateMetadata({ params }: PageProps<"/social/[id]">): Promise<Metadata> {
  const event = await load((await params).id);
  return event ? { title: event.title, description: `${formatWhen(event.starts_at)} · ${event.area}` } : { title: "Event not found" };
}

type Member = { user_id: string; status: MemberStatus; created_at: string };

export default async function SocialEventPage({ params, searchParams }: PageProps<"/social/[id]">) {
  const { id } = await params;
  const { created } = await searchParams;
  // Your id is checked on our own server (no database trip), then the event,
  // who's going and the address all load at the same time.
  const myId = await getUserId();
  const me = myId ? { id: myId } : null;
  const supabase = await createClient();
  const [event, { data: memberRows }, { data: address }, { data: chat }] = await Promise.all([
    load(id),
    me && UUID.test(id) ? supabase.from("social_event_members").select("user_id, status, created_at").eq("event_id", id).order("created_at") : Promise.resolve({ data: [] }),
    me && UUID.test(id) ? supabase.from("social_event_addresses").select("address, lat, lng").eq("event_id", id).maybeSingle() : Promise.resolve({ data: null }),
    // The group chat: only the host and people going can see it.
    me && UUID.test(id) ? supabase.from("threads").select("id").eq("social_event_id", id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!event) notFound();
  const isHost = me?.id === event.host_id;
  const members = (memberRows ?? []) as Member[];
  const cards = await getCards(supabase, [event.host_id, ...members.map((m) => m.user_id)]);
  const host = cards.get(event.host_id);
  const mine = members.find((m) => m.user_id === me?.id)?.status ?? null;
  const going = members.filter((m) => m.status === "going");
  const requests = members.filter((m) => m.status === "pending");
  const left = spacesLeft(event);
  const finished = new Date(event.ends_at).getTime() < nowMs();
  const cat = categoryInfo(event.category);
  const pin = address?.lat != null && address?.lng != null ? address : null;

  return (
    <article className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/social" className="text-sm font-semibold text-muted hover:text-ink">← Social</Link>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-bold">
        <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-brand">{cat.label}</span>
        <span className={`rounded-full px-2.5 py-0.5 ${event.is_private ? "bg-ink text-surface" : "bg-brand-soft text-brand"}`}>
          {event.is_private ? "Private" : "Open"}
        </span>
        {event.friends_only && <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-brand">Friends only</span>}
        {event.is_cancelled && <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-danger">Cancelled</span>}
      </div>
      <h1 className="mt-3 font-display text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">{event.title}</h1>

      {host && (
        <Link href={`/u/${host.id}`} className="mt-3 inline-flex items-center gap-2 font-semibold">
          <Avatar name={host.name} url={host.avatar_url} size={28} ring="host" />
          <span>Hosted by <span className="text-brand">{host.name}</span></span>
        </Link>
      )}

      {created && isHost && (
        <p className="mt-4 rounded-2xl bg-ok/10 px-4 py-3 text-sm font-semibold text-ok">✓ Your event is live. Share the link to invite people.</p>
      )}

      <dl className="card mt-5 space-y-4">
        <div>
          <dt className="text-sm font-semibold text-muted">When</dt>
          <dd className="font-semibold">{formatWhen(event.starts_at)}–{time(event.ends_at)}</dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-muted">Where</dt>
          <dd className="font-semibold">{event.area}</dd>
          {address?.address ? (
            <dd className="text-sm">{address.address}</dd>
          ) : (
            !isHost && <dd className="text-sm text-muted">The exact spot is shared with people going.</dd>
          )}
          {pin && (
            <a href={`https://www.google.com/maps/search/?api=1&query=${pin.lat},${pin.lng}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand">
              Open in Maps →
            </a>
          )}
        </div>
        <div>
          <dt className="text-sm font-semibold text-muted">Spaces</dt>
          <dd className={`font-semibold ${left === 0 ? "text-danger" : ""}`}>
            {left === 0 ? `Full (${event.spaces} of ${event.spaces})` : `${left} of ${event.spaces} spaces left`}
          </dd>
        </div>
      </dl>

      <Attendees
        host={host ? { id: host.id, name: host.name, avatar_url: host.avatar_url } : null}
        people={
          isHost || mine === "going"
            ? going.map((g) => {
                const p = cards.get(g.user_id);
                return { id: g.user_id, name: p?.name ?? "Member", avatar_url: p?.avatar_url ?? null };
              })
            : null
        }
        guests={event.going_count}
      />

      {/* The main button */}
      <div className="mt-5">
        <JoinPanel
          eventId={event.id}
          isPrivate={event.is_private}
          cancelled={event.is_cancelled}
          loggedIn={Boolean(me)}
          isHost={isHost}
          mine={mine}
          left={left}
          finished={finished}
          hostName={host?.name ?? "The host"}
        />
        {chat && (isHost || mine === "going") && (
          <Link href={`/chats/${chat.id}`} prefetch={false} className="btn-ghost mt-3 w-full py-3">
            Open group chat
          </Link>
        )}
      </div>

      {event.description && <p className="mt-6 text-lg leading-relaxed whitespace-pre-line">{event.description}</p>}

      {/* Host: requests to approve */}
      {isHost && requests.length > 0 && !event.is_cancelled && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-bold">Requests ({requests.length})</h2>
          <p className="text-sm text-muted">Tap someone to see their profile.</p>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {requests.map((r) => {
              const p = cards.get(r.user_id);
              return (
                <InstantRow
                  key={r.user_id}
                  buttons={[
                    { label: "Approve", action: respondToRequest.bind(null, id, r.user_id, true), className: "btn px-3 py-1.5 text-sm" },
                    { label: "Decline", action: respondToRequest.bind(null, id, r.user_id, false), className: "btn-ghost px-3 py-1.5 text-sm" },
                  ]}
                >
                  <Link href={`/u/${r.user_id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={p?.name ?? "Member"} url={p?.avatar_url} size={40} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{p?.name ?? "Member"}</span>
                      {p?.course && <span className="block truncate text-xs text-muted">{p.course}</span>}
                    </span>
                  </Link>
                </InstantRow>
              );
            })}
          </ul>
        </section>
      )}

      {/* The host's guest list, with Remove (everyone else uses the faces above) */}
      {isHost && going.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-bold">Going ({going.length + 1})</h2>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {host && (
              <li className="flex items-center gap-3 px-4 py-3">
                <Avatar name={host.name} url={host.avatar_url} size={40} ring="host" />
                <span className="flex-1 font-semibold">{host.name}</span>
                <span className="text-xs font-bold text-muted">Host</span>
              </li>
            )}
            {going.map((g) => {
              const p = cards.get(g.user_id);
              return (
                <InstantRow
                  key={g.user_id}
                  className="flex items-center gap-3 px-4 py-3"
                  buttons={
                    isHost && !finished
                      ? [{ label: "Remove", action: removeGuest.bind(null, id, g.user_id), className: "text-sm font-semibold text-muted hover:text-danger", confirmText: `Remove ${p?.name ?? "them"} from this event?` }]
                      : []
                  }
                >
                  <Link href={`/u/${g.user_id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={p?.name ?? "Member"} url={p?.avatar_url} size={40} />
                    <span className="truncate font-semibold">{p?.name ?? "Member"}</span>
                  </Link>
                </InstantRow>
              );
            })}
          </ul>
        </section>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <ShareButton url={`${SITE_URL}/social/${id}`} title={event.title} />
        {me && !isHost && <ReportLink id={id} />}
      </div>
    </article>
  );
}
