"use client";

import Link from "next/link";
import { useState } from "react";
import { useInstant } from "@/lib/use-instant";
import type { MemberStatus } from "@/lib/social-events";
import { cancelSocialEvent, joinSocialEvent, leaveSocialEvent } from "../actions";

type State = { mine: MemberStatus | null; cancelled: boolean };

// Join, leave, withdraw or cancel. The panel changes the moment you tap;
// the database catches up in the background (and it undoes itself if not).
export function JoinPanel({
  eventId,
  isPrivate,
  cancelled,
  loggedIn,
  isHost,
  mine,
  left,
  finished,
  hostName,
  suggestPrompt = false,
}: {
  eventId: string;
  isPrivate: boolean;
  cancelled: boolean;
  loggedIn: boolean;
  isHost: boolean;
  mine: MemberStatus | null;
  left: number;
  finished: boolean;
  hostName: string;
  // No profile prompts answered yet: suggest one before requesting to join.
  suggestPrompt?: boolean;
}) {
  const [state, run] = useInstant<State>({ mine, cancelled });
  const [asking, setAsking] = useState(false);
  const box = "card flex flex-wrap items-center justify-between gap-3";
  const quiet = "text-sm font-semibold text-muted hover:text-danger";

  if (state.cancelled) return <div className={box}><p className="font-semibold text-danger">This event has been cancelled.</p></div>;
  if (finished) return <div className={box}><p className="font-semibold text-muted">This event has finished.</p></div>;
  if (!loggedIn) {
    return (
      <div className={box}>
        <p className="font-semibold">Log in to join.</p>
        <Link href={`/login?next=/social/${eventId}`} className="btn">Log in</Link>
      </div>
    );
  }
  if (isHost) {
    return (
      <div className={box}>
        <p className="font-semibold">You&apos;re hosting</p>
        <span className="flex gap-2">
          <Link href={`/social/${eventId}/edit`} className="btn-ghost py-2">Edit</Link>
          <button
            type="button"
            className="btn-ghost py-2 text-danger"
            onClick={() => {
              if (!confirm("Cancel this event? Everyone going will see it's cancelled.")) return;
              run({ ...state, cancelled: true }, () => cancelSocialEvent(eventId));
            }}
          >
            Cancel event
          </button>
        </span>
      </div>
    );
  }
  if (state.mine === "going") {
    return (
      <div className={box}>
        <p className="font-semibold"><span className="text-ok">✓</span> You&apos;re going</p>
        <button
          type="button"
          className={quiet}
          onClick={() => {
            if (!confirm("Leave this event? Your space goes to someone else.")) return;
            run({ ...state, mine: null }, () => leaveSocialEvent(eventId));
          }}
        >
          Leave
        </button>
      </div>
    );
  }
  if (state.mine === "pending") {
    return (
      <div className={box}>
        <p className="font-semibold">Request sent. {hostName} will approve or decline.</p>
        <button type="button" className={quiet} onClick={() => run({ ...state, mine: null }, () => leaveSocialEvent(eventId))}>
          Withdraw request
        </button>
      </div>
    );
  }
  if (state.mine === "declined") {
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
  const join = () => run({ ...state, mine: isPrivate ? "pending" : "going" }, () => joinSocialEvent(eventId));
  if (asking) {
    return (
      <div className="card space-y-3">
        <p className="font-semibold">Add a prompt so the host knows who you are</p>
        <p className="text-sm text-muted">{hostName} sees your profile when deciding. A quick answer or two helps.</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/account#prompts" className="btn">Add a prompt</Link>
          <button type="button" className="btn-ghost" onClick={join}>Skip and send request</button>
        </div>
      </div>
    );
  }
  return (
    <div className={box}>
      <p className="font-semibold">{isPrivate ? `${hostName} approves who comes.` : "Coming?"}</p>
      <button type="button" className="btn px-6" onClick={() => (isPrivate && suggestPrompt ? setAsking(true) : join())}>
        {isPrivate ? "Request to join" : "I'm in"}
      </button>
    </div>
  );
}

// A row (a join request, or someone going) that disappears as soon as the
// host taps one of its buttons, and comes back with a message if that fails.
export function InstantRow({
  children,
  buttons,
  className = "flex flex-wrap items-center gap-3 px-4 py-3",
}: {
  children: React.ReactNode;
  className?: string;
  buttons: { label: string; action: () => Promise<{ error?: string }>; className: string; confirmText?: string }[];
}) {
  const [hidden, run] = useInstant(false);
  if (hidden) return null;
  return (
    <li className={className}>
      {children}
      {buttons.length > 0 && <span className="flex gap-2">
        {buttons.map((b) => (
          <button
            key={b.label}
            type="button"
            className={b.className}
            onClick={() => {
              if (b.confirmText && !confirm(b.confirmText)) return;
              run(true, b.action);
            }}
          >
            {b.label}
          </button>
        ))}
      </span>}
    </li>
  );
}
