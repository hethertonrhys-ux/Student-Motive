"use client";

import { useActionState } from "react";
import { submitClaim, type ClaimState } from "./actions";

export function ClaimForm({ societies }: { societies: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(submitClaim, {} as ClaimState);

  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="society_id" className="label">Society</label>
        <select id="society_id" name="society_id" required className="input" defaultValue="">
          <option value="" disabled>Choose your society…</option>
          {societies.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="committee_role" className="label">Your role on the committee</label>
        <input id="committee_role" name="committee_role" required placeholder="e.g. President, Events Officer" className="input" />
      </div>
      <div>
        <label htmlFor="message" className="label">
          Anything else? <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea id="message" name="message" rows={3} className="input" placeholder="e.g. a link to the committee page on the SU website" />
      </div>
      {state.error && <p className="text-sm font-medium text-danger">{state.error}</p>}
      <button className="btn" disabled={pending}>{pending ? "Sending…" : "Send request"}</button>
    </form>
  );
}
