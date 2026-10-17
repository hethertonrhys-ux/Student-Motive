"use client";

import { useActionState } from "react";
import type { EventTable } from "@/lib/types";
import type { AddState } from "./actions";

// For people who turn up late or without their phone.
export function LateArrivalForm({
  action,
  members,
  tables,
}: {
  action: (s: AddState, f: FormData) => Promise<AddState>;
  members: { userId: string; name: string }[];
  tables: EventTable[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  if (members.length === 0) return null;
  return (
    <details className="mt-4 rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-semibold">+ Add someone (arrived late or no phone)</summary>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <select name="user_id" required defaultValue="" className="input w-auto flex-1" aria-label="Member">
          <option value="" disabled>Choose a member</option>
          {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
        </select>
        {tables.length > 0 && (
          <select name="table_id" defaultValue={tables[0].id} className="input w-auto" aria-label="Table">
            {tables.map((t) => <option key={t.id} value={t.id}>{t.name}{t.level ? ` · ${t.level}` : ""}</option>)}
            <option value="">No table yet</option>
          </select>
        )}
        <button className="btn" disabled={pending}>{pending ? "Adding…" : "Add"}</button>
        {state.error && <p className="w-full text-sm font-medium text-danger">{state.error}</p>}
      </form>
      <p className="mt-2 text-xs text-muted">Not a member on Function? Add them by name in the results below instead.</p>
    </details>
  );
}
