"use client";

import { useActionState } from "react";
import { allowEmail, type AllowEmailState } from "./actions";

export function AllowEmailForm() {
  const [state, action, pending] = useActionState(allowEmail, {} as AllowEmailState);

  return (
    <div>
      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="allow-email" className="label">Email or domain</label>
          <input
            id="allow-email"
            name="email"
            required
            placeholder="jo@gmail.com or @kcl.ac.uk"
            autoCapitalize="none"
            autoCorrect="off"
            className="input"
            key={state.added}
          />
        </div>
        <div className="flex-1">
          <label htmlFor="allow-note" className="label">Note (optional)</label>
          <input id="allow-note" name="note" maxLength={120} placeholder="e.g. Poker Soc guest" className="input" key={state.added} />
        </div>
        <button className="btn" disabled={pending}>{pending ? "Adding…" : "Allow"}</button>
      </form>
      <p className="mt-3 text-sm" aria-live="polite">
        {state.error && <span className="text-danger">{state.error}</span>}
        {state.added && (
          <span className="text-ok">
            Done. {state.added.startsWith("@") ? `Anyone with a ${state.added} email` : state.added} can now log in.
          </span>
        )}
      </p>
    </div>
  );
}
