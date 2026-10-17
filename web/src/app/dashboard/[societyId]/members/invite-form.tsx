"use client";

import { useActionState } from "react";
import type { InviteState } from "./actions";

export function InviteForm({ action }: { action: (state: InviteState, formData: FormData) => Promise<InviteState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <label htmlFor="emails" className="label">Add members by email</label>
      <textarea
        id="emails"
        name="emails"
        rows={4}
        key={state.added}
        placeholder={"a.student@lse.ac.uk\nb.student@lse.ac.uk"}
        className="input font-mono text-sm"
      />
      <p className="text-xs text-muted">
        Paste your SU membership list: one email per line, or separated by commas. People already on Motive are approved
        now; everyone else is approved automatically when they sign up.
      </p>
      {state.error && <p className="text-sm font-medium text-danger">{state.error}</p>}
      {state.added !== undefined && <p className="text-sm font-medium text-ok">Added {state.added} {state.added === 1 ? "email" : "emails"}.</p>}
      <button className="btn" disabled={pending}>{pending ? "Adding…" : "Add members"}</button>
    </form>
  );
}
