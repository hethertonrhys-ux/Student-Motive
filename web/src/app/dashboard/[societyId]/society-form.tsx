"use client";

import { useActionState } from "react";
import type { Society } from "@/lib/types";
import type { FormState } from "./actions";
import { initialOf } from "@/lib/universities";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  society: Society;
};

export function SocietyForm({ action, society }: Props) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-5">
      <div className="flex items-center gap-4">
        {society.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={society.logo_url} alt="" className="size-16 rounded-2xl object-cover" />
        ) : (
          <div className="grid size-16 place-items-center rounded-2xl bg-brand-soft font-display text-2xl font-extrabold text-brand">
            {initialOf(society.name)}
          </div>
        )}
        <div className="flex-1">
          <label htmlFor="logo" className="label">Logo</label>
          <input id="logo" name="logo" type="file" accept="image/jpeg,image/png,image/webp" className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-1 file:font-semibold file:text-brand" />
        </div>
      </div>
      <div>
        <label htmlFor="description" className="label">About</label>
        <textarea id="description" name="description" rows={3} maxLength={2000} defaultValue={society.description ?? ""} placeholder="One or two sentences about your society." className="input" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="instagram" className="label">Instagram</label>
          <input id="instagram" name="instagram" defaultValue={society.instagram ?? ""} placeholder="@yoursociety" className="input" />
        </div>
        <div>
          <label htmlFor="website" className="label">Website</label>
          <input id="website" name="website" defaultValue={society.website ?? ""} placeholder="https://…" className="input" />
        </div>
      </div>
      {state.error && <p className="text-sm font-medium text-danger">{state.error}</p>}
      {state.saved && !pending && <p className="text-sm font-medium text-ok">Saved.</p>}
      <button className="btn-ghost" disabled={pending}>{pending ? "Saving…" : "Save society details"}</button>
    </form>
  );
}
