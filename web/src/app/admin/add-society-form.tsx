"use client";

import { useActionState } from "react";
import { addSociety, type AddSocietyState } from "./actions";

export function AddSocietyForm() {
  const [state, action, pending] = useActionState(addSociety, {} as AddSocietyState);

  return (
    <div>
      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="name" className="label">Name</label>
          <input id="name" name="name" required placeholder="e.g. LSE Chess Society" className="input" key={state.added} />
        </div>
        <div>
          <label htmlFor="kind" className="label">Type</label>
          <select id="kind" name="kind" defaultValue="society" className="input">
            <option value="society">Society</option>
            <option value="hall">Hall</option>
            <option value="university">University</option>
            <option value="promoter">Club night / promoter</option>
          </select>
        </div>
        <button className="btn" disabled={pending}>{pending ? "Adding…" : "Add"}</button>
      </form>
      <p className="mt-3 text-sm" aria-live="polite">
        {state.error && <span className="text-danger">{state.error}</span>}
        {state.added && <span className="text-ok">Added {state.added}.</span>}
      </p>
    </div>
  );
}
