import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { ShareButton } from "@/components/share-button";
import { getProfile } from "@/lib/auth";
import { getCards } from "@/lib/social";
import { SOCIAL_EVENT_FIELDS, categoryInfo, formatWhen, spacesLeft, type MemberStatus, type SocialEvent } from "@/lib/social-events";
import { SITE_URL } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { nowMs } from "@/lib/time";
import { cancelSocialEvent, joinSocialEvent, leaveSocialEvent, removeGuest, respondToRequest } from "../actions";
import { ActionButton } from "../components/action-button";
import { ReportLink } from "../components/report-link";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/London" }).format(new Date(iso));

async function load(id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("social_events").select(SOCIAL_EVENT_FIELDS).eq("id", id).maybeSingle();
  return data as SocialEvent | null;
}

export async function generateMetadata({ params }: PageProps<"/social/[id]">): Promise<Metadata> {
  const event = await load((await params).id);
  return event ? { title: event.title, description: `${formatWhen(event.starts_at)} · ${event.area}` } : { title: "Event not found" };
}

type Member = { user_id: string; status: MemberStatus; created_at: string };

export default async function SocialEventPage({ params, searchParams }: PageProps<"/social/[id]">) {
  const { id } = await params;
  const { created } = await searchParams;
  const event = await load(id);
  if (!event) notFound();

  const me = await getProfile();
  const supabase = await createClient();
  const isHost = me?.id === event.host_id;
  const [{ data: memberRows }, { data: address }] = await Promise.all([
    me ? supabase.from("social_event_members").select("user_id, status, created_at").eq("event_id", id).order("created_at") : Promise.resolve({ data: [] }),
    me ? supabase.from("social_event_addresses").select("address, lat, lng").eq("event_id", id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
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
        <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-brand">{cat.emoji} {cat.label}</span>
        <span className={`rounded-full px-2.5 py-0.5 ${event.is_private ? "bg-ink text-surface" : "bg-brand-soft text-brand"}`}>
          {event.is_private ? "🔒 Private" : "Open"}
        </span>
        {event.friends_only && <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-brand">👥 Friends only</span>}
        {event.is_cancelled && <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-danger">Cancelled</span>}
      </div>
      <h1 className="mt-3 font-display text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">{event.title}</h1>

      {host && (
        <Link href={`/u/${host.id}`} className="mt-3 inline-flex items-center gap-2 font-semibold">
          <Avatar name={host.name} url={host.avatar_url} size={28} />
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
            <dd className="text-sm">📍 {address.address}</dd>
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

      {/* The main button */}
      <div className="mt-5">
        <JoinPanel event={event} loggedIn={Boolean(me)} isHost={isHost} mine={mine} left={left} finished={finished} hostName={host?.name ?? "The host"} />
      </div>

      {event.description && <p className="mt-6 text-lg leading-relaxed whitespace-pre-line">{event.description}</p>}

      {/* Host: requests to approve */}
      {isHost && requests.length > 0 && !event.is_cancelled && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-bold">🔔 Requests ({requests.length})</h2>
          <p className="text-sm text-muted">Tap someone to see their profile.</p>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {requests.map((r) => {
              const p = cards.get(r.user_id);
              return (
                <li key={r.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Link href={`/u/${r.user_id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={p?.name ?? "Member"} url={p?.avatar_url} size={40} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{p?.name ?? "Member"}</span>
                      {p?.course && <span className="block truncate text-xs text-muted">{p.course}</span>}
                    </span>
                  </Link>
                  <span className="flex gap-2">
                    <ActionButton action={respondToRequest.bind(null, id, r.user_id, true)} className="btn px-3 py-1.5 text-sm">Approve</ActionButton>
                    <ActionButton action={respondToRequest.bind(null, id, r.user_id, false)} className="btn-ghost px-3 py-1.5 text-sm">Decline</ActionButton>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Who's going: the host and people going can see it */}
      {(isHost || mine === "going") && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-bold">Going ({going.length + 1})</h2>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {host && (
              <li className="flex items-center gap-3 px-4 py-3">
                <Avatar name={host.name} url={host.avatar_url} size={40} />
                <span className="flex-1 font-semibold">{host.name}</span>
                <span className="text-xs font-bold text-muted">Host</span>
              </li>
            )}
            {going.map((g) => {
              const p = cards.get(g.user_id);
              return (
                <li key={g.user_id} className="flex items-center gap-3 px-4 py-3">
                  <Link href={`/u/${g.user_id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={p?.name ?? "Member"} url={p?.avatar_url} size={40} />
                    <span className="truncate font-semibold">{p?.name ?? "Member"}</span>
                  </Link>
                  {isHost && !finished && (
                    <ActionButton
                      action={removeGuest.bind(null, id, g.user_id)}
                      confirmText={`Remove ${p?.name ?? "them"} from this event?`}
                      className="text-sm font-semibold text-muted hover:text-danger"
                    >
                      Remove
                    </ActionButton>
                  )}
                </li>
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

function JoinPanel({
  event,
  loggedIn,
  isHost,
  mine,
  left,
  finished,
  hostName,
}: {
  event: SocialEvent;
  loggedIn: boolean;
  isHost: boolean;
  mine: MemberStatus | null;
  left: number;
  finished: boolean;
  hostName: string;
}) {
  const box = "card flex flex-wrap items-center justify-between gap-3";
  if (event.is_cancelled) return <div className={box}><p className="font-semibold text-danger">This event has been cancelled.</p></div>;
  if (finished) return <div className={box}><p className="font-semibold text-muted">This event has finished.</p></div>;
  if (!loggedIn) {
    return (
      <div className={box}>
        <p className="font-semibold">Log in to join.</p>
        <Link href={`/login?next=/social/${event.id}`} className="btn">Log in</Link>
      </div>
    );
  }
  if (isHost) {
    return (
      <div className={box}>
        <p className="font-semibold">You&apos;re hosting</p>
        <span className="flex gap-2">
          <Link href={`/social/${event.id}/edit`} className="btn-ghost py-2">Edit</Link>
          <ActionButton
            action={cancelSocialEvent.bind(null, event.id)}
            confirmText="Cancel this event? Everyone going will see it's cancelled."
            className="btn-ghost py-2 text-danger"
          >
            Cancel event
          </ActionButton>
        </span>
      </div>
    );
  }
  if (mine === "going") {
    return (
      <div className={box}>
        <p className="font-semibold"><span className="text-ok">✓</span> You&apos;re going</p>
        <ActionButton action={leaveSocialEvent.bind(null, event.id)} confirmText="Leave this event? Your space goes to someone else." className="text-sm font-semibold text-muted hover:text-danger">
          Leave
        </ActionButton>
      </div>
    );
  }
  if (mine === "pending") {
    return (
      <div className={box}>
        <p className="font-semibold">⏳ Request sent. {hostName} will approve or decline.</p>
        <ActionButton action={leaveSocialEvent.bind(null, event.id)} className="text-sm font-semibold text-muted hover:text-danger">Withdraw request</ActionButton>
      </div>
    );
  }
  if (mine === "declined") {
    return <div className={box}><p className="font-semibold text-muted">{hostName} declined your request for this one.</p></div>;
  }
  if (left === 0) {
    return (
      <div className={box}>
        <p className="font-semibold">No spaces left.</p>
        <button type="button" disabled className="btn">Full</button>
      </div>
    );
  }
  return (
    <div className={box}>
      <p className="font-semibold">{event.is_private ? `${hostName} approves who comes.` : "Coming?"}</p>
      <ActionButton action={joinSocialEvent.bind(null, event.id)} className="btn px-6">
        {event.is_private ? "Request to join" : "I'm in"}
      </ActionButton>
    </div>
  );
}
