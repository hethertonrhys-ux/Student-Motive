"use client";

import { useActionState } from "react";
import type { JoinState } from "./actions";

export function JoinForm({ action, defaultName }: { action: (s: JoinState, f: FormData) => Promise<JoinState>; defaultName: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor="name" className="label">Your name</label>
        <input id="name" name="name" required minLength={2} maxLength={60} defaultValue={defaultName} placeholder="First and last name" className="input" />
      </div>
      <button className="btn" disabled={pending}>{pending ? "Sending…" : "Join society"}</button>
      {state.error && <p className="text-sm font-medium text-danger sm:basis-full">{state.error}</p>}
    </form>
  );
}
