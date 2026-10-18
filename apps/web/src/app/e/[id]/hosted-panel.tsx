import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { HIDE, InstantArea, InstantFormButton } from "@/components/instant";
import { NameForm } from "@/components/name-form";
import { PersonRow } from "@/components/person-row";
import { saveName } from "@/app/account/actions";
import { cancelHostedEvent, openEventChat, removeGuest, respondToJoinRequest } from "@/app/host/actions";
import { getProfile } from "@/lib/auth";
import { getCards, type PersonCard } from "@/lib/social";
import { createClient } from "@/lib/supabase/server";
import { hasEnded } from "@/lib/time";
import type { MotiveEvent } from "@/lib/types";
import { ActionButton } from "./action-button";
import { joinEvent, leaveEvent } from "./actions";

type Entry = { user_id: string; status: "going" | "waitlist" | "requested"; created_at: string };

// The join/guest-list part of an event a student is hosting.
export async function HostedPanel({ event, host }: { event: MotiveEvent; host: PersonCard | null }) {
  const profile = await getProfile();
  const finished = hasEnded(event.ends_at);
  const isHost = profile?.id === event.host_user_id;

  if (!profile) {
    return (
      <div className="card mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold">Log in to join.</p>
        <Link href={`/login?next=/e/${event.id}`} className="btn">Log in</Link>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("event_entries")
    .select("user_id, status, created_at")
    .eq("event_id", event.id)
    .order("created_at");
  const entries = (data ?? []) as Entry[];
  const cards = await getCards(supabase, entries.map((e) => e.user_id));
  const mine = entries.find((e) => e.user_id === profile.id) ?? null;
  const going = entries.filter((e) => e.status === "going");
  const waiting = entries.filter((e) => e.status === "waitlist");
  const requests = entries.filter((e) => e.status === "requested");
  const full = event.capacity !== null && event.going_count >= event.capacity;
  const canSeeGuests = isHost || mine?.status === "going";

  if (event.is_cancelled) return null;

  return (
    <div className="mt-6 space-y-6">
      {/* Your status and the join button. */}
      {isHost ? (
        <div className="card space-y-3">
          <p className="font-display text-lg font-bold">You&apos;re hosting</p>
          <p className="text-sm text-muted">
            {event.going_count} going{event.capacity ? ` of ${event.capacity}` : ""}
            {requests.length ? ` · ${requests.length} waiting for your answer` : ""}
            {event.visibility === "friends" ? " · Friends only" : " · On the public map"}
          </p>
          <div className="flex flex-wrap gap-2">
            {!finished && <Link href={`/host/${event.id}/edit`} className="btn-ghost py-2">Edit</Link>}
            <form action={openEventChat.bind(null, event.id)}>
              <button className="btn py-2">Open event chat</button>
            </form>
            {!finished && (
              <form action={cancelHostedEvent.bind(null, event.id)}>
                <button className="btn-ghost py-2 text-danger">Cancel event</button>
              </form>
            )}
          </div>
        </div>
      ) : finished ? null : !profile.display_name && !mine ? (
        <NameForm action={saveName.bind(null, `/e/${event.id}`)} />
      ) : (
        <InstantArea>
          <JoinCard event={event} mine={mine?.status ?? null} hostName={host?.name ?? "The host"} full={full} />
        </InstantArea>
      )}

      {/* The host answers requests. */}
      {isHost && requests.length > 0 && (
        <Section title={`Asking to join (${requests.length})`}>
          {requests.map((e) => {
            const p = cards.get(e.user_id);
            return (
              <InstantArea key={e.user_id}>
                <PersonRow id={e.user_id} name={p?.name ?? "Member"} avatarUrl={p?.avatar_url} detail={p?.course}>
                  <span className="flex gap-2">
                    <InstantFormButton action={respondToJoinRequest.bind(null, event.id, e.user_id, true)} after={HIDE} className="btn px-3 py-1.5 text-sm">Accept</InstantFormButton>
                    <InstantFormButton action={respondToJoinRequest.bind(null, event.id, e.user_id, false)} after={HIDE} className="btn-ghost px-3 py-1.5 text-sm">Decline</InstantFormButton>
                  </span>
                </PersonRow>
              </InstantArea>
            );
          })}
        </Section>
      )}

      {/* Who's coming: shown to the host and guests. */}
      {canSeeGuests && (
        <Section title={`Going (${going.length + 1})`}>
          {host && (
            <PersonRow id={host.id} name={host.name} avatarUrl={host.avatar_url} detail="Host" />
          )}
          {going.map((e) => {
            const p = cards.get(e.user_id);
            return (
              <InstantArea key={e.user_id}>
                <PersonRow id={e.user_id} name={p?.name ?? "Member"} avatarUrl={p?.avatar_url} detail={p?.course}>
                  {isHost && !finished && (
                    <InstantFormButton action={removeGuest.bind(null, event.id, e.user_id)} after={HIDE} className="text-sm font-semibold text-muted hover:text-danger">Remove</InstantFormButton>
                  )}
                </PersonRow>
              </InstantArea>
            );
          })}
        </Section>
      )}
      {isHost && waiting.length > 0 && (
        <Section title={`Waiting list (${waiting.length})`}>
          {waiting.map((e) => {
            const p = cards.get(e.user_id);
            return <PersonRow key={e.user_id} id={e.user_id} name={p?.name ?? "Member"} avatarUrl={p?.avatar_url} detail={p?.course} />;
          })}
        </Section>
      )}
      {!canSeeGuests && going.length === 0 && event.going_count > 0 && (
        <p className="text-sm text-muted">
          <Avatar name={host?.name ?? "Host"} url={host?.avatar_url} size={20} /> {event.going_count} going. You&apos;ll see who once you&apos;re in.
        </p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">{children}</ul>
    </section>
  );
}

// Your status and the join button. "preview" draws it as it will look
// straight after a tap (see InstantArea).
function JoinCard({
  event,
  mine,
  hostName,
  full,
  preview,
}: {
  event: MotiveEvent;
  mine: Entry["status"] | null;
  hostName: string;
  full: boolean;
  preview?: boolean;
}) {
  const after = (next: Entry["status"] | null) => (preview ? undefined : <JoinCard event={event} mine={next} hostName={hostName} full={full} preview />);
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3">
      {mine === "going" ? (
        <>
          <p className="font-semibold"><span className="text-ok">✓</span> You&apos;re going</p>
          <span className="flex flex-wrap items-center gap-3">
            <form action={openEventChat.bind(null, event.id)}>
              <button className="btn py-2">Event chat</button>
            </form>
            <ActionButton action={leaveEvent.bind(null, event.id)} variant="link" confirmText="Can't make it? You'll lose your place." after={after(null)}>
              Can&apos;t make it
            </ActionButton>
          </span>
        </>
      ) : mine === "requested" ? (
        <>
          <p className="font-semibold">Request sent. {hostName} will let you know.</p>
          <ActionButton action={leaveEvent.bind(null, event.id)} variant="link" after={after(null)}>Cancel request</ActionButton>
        </>
      ) : mine === "waitlist" ? (
        <>
          <p className="font-semibold">You&apos;re on the waiting list</p>
          <ActionButton action={leaveEvent.bind(null, event.id)} variant="link" after={after(null)}>Leave waiting list</ActionButton>
        </>
      ) : (
        <>
          <p className="font-semibold">
            {event.join_mode === "approval" ? `${hostName} approves who comes.` : full ? "It's full." : "Coming?"}
          </p>
          <ActionButton action={joinEvent.bind(null, event.id, null)} after={after(event.join_mode === "approval" ? "requested" : full ? "waitlist" : "going")}>
            {event.join_mode === "approval" ? "Ask to join" : full ? "Join the waiting list" : "I'm going"}
          </ActionButton>
        </>
      )}
    </div>
  );
}
