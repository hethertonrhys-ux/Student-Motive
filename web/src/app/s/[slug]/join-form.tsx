"use client";

import { useActionState } from "react";
import { useInstantArea } from "@/components/instant";
import type { JoinState } from "./actions";

// Given an "after" version (inside an InstantArea), the page shows it the
// moment you tap Join, while the request is sent in the background.
export function JoinForm({
  action,
  defaultName,
  after,
}: {
  action: (s: JoinState, f: FormData) => Promise<JoinState>;
  defaultName: string;
  after?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const run = useInstantArea();
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!run || after === undefined) return;
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        run(after, () => action({}, data));
      }}
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <label htmlFor="name" className="label">Your name</label>
        <input id="name" name="name" required minLength={2} maxLength={60} defaultValue={defaultName} placeholder="First and last name" className="input" />
      </div>
      <button className="btn" disabled={pending}>{pending ? "Sending…" : "Join society"}</button>
      {state.error && <p className="text-sm font-medium text-danger sm:basis-full">{state.error}</p>}
    </form>
  );
}
