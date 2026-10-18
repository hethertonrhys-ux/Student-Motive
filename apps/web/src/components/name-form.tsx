"use client";

import { useActionState } from "react";
import type { NameState } from "@/app/account/actions";

// Asks for the name other members will see (e.g. at a poker table).
export function NameForm({ action }: { action: (s: NameState, f: FormData) => Promise<NameState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="card space-y-2">
      <label htmlFor="your-name" className="font-semibold">First, what&apos;s your name?</label>
      <p className="text-sm text-muted">Other members see this when you join events.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id="your-name" name="name" required minLength={2} maxLength={60} placeholder="First and last name" className="input flex-1" />
        <button className="btn" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </div>
      {state.error && <p className="text-sm font-medium text-danger">{state.error}</p>}
    </form>
  );
}
