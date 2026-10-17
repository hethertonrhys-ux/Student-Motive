"use client";

import { useState, useTransition } from "react";
import { messageFriend, removeFriend, respondToRequest, sendFriendRequest } from "@/app/friends/actions";
import type { Relation } from "@/lib/social";

// Add friend / Requested / Accept / Friends, depending on how you're connected.
export function FriendButton({ id, relation, compact = false }: { id: string; relation: Relation; compact?: boolean }) {
  const [state, setState] = useState<Relation>(relation);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const size = compact ? "px-3 py-1.5 text-sm" : "px-4 py-2";

  if (state === "self") return null;

  const run = (fn: () => Promise<unknown>, next: Relation) =>
    start(async () => {
      setError(null);
      const result = (await fn()) as { error?: string; result?: string } | undefined;
      if (result?.error) setError(result.error);
      else setState(result?.result === "accepted" ? "friends" : next);
    });

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex flex-wrap justify-end gap-2">
        {state === "none" && (
          <button type="button" disabled={pending} onClick={() => run(() => sendFriendRequest(id), "outgoing")} className={`btn ${size}`}>
            + Add friend
          </button>
        )}
        {state === "outgoing" && (
          <button type="button" disabled={pending} onClick={() => run(() => removeFriend(id), "none")} className={`btn-ghost ${size}`} title="Cancel request">
            Requested ✓
          </button>
        )}
        {state === "incoming" && (
          <>
            <button type="button" disabled={pending} onClick={() => run(() => respondToRequest(id, true), "friends")} className={`btn ${size}`}>
              Accept
            </button>
            <button type="button" disabled={pending} onClick={() => run(() => respondToRequest(id, false), "none")} className={`btn-ghost ${size}`}>
              Decline
            </button>
          </>
        )}
        {state === "friends" && (
          <>
            <form action={messageFriend.bind(null, id)}>
              <button className={`btn ${size}`}>Message</button>
            </form>
            {!compact && (
              <button
                type="button"
                disabled={pending}
                onClick={() => confirm("Remove this friend?") && run(() => removeFriend(id), "none")}
                className={`btn-ghost ${size}`}
              >
                Friends ✓
              </button>
            )}
          </>
        )}
      </span>
      {error && <span className="text-xs font-medium text-danger">{error}</span>}
    </span>
  );
}
