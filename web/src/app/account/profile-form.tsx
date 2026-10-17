"use client";

import { useActionState } from "react";
import { saveProfile, type ProfileState } from "./actions";

export function ProfileForm({ name, course, bio }: { name: string; course: string; bio: string }) {
  const [state, action, pending] = useActionState(saveProfile, {} as ProfileState);
  return (
    <form action={action} className="card mt-6 space-y-5">
      <div>
        <label htmlFor="name" className="label">Name</label>
        <input id="name" name="name" required minLength={2} maxLength={60} defaultValue={name} placeholder="First and last name" className="input" />
      </div>
      <div>
        <label htmlFor="course" className="label">
          Course and year <span className="font-normal text-muted">(optional)</span>
        </label>
        <input id="course" name="course" maxLength={60} defaultValue={course} placeholder="e.g. Economics, 2nd year" className="input" />
      </div>
      <div>
        <label htmlFor="bio" className="label">
          About you <span className="font-normal text-muted">(optional, 160 characters)</span>
        </label>
        <textarea id="bio" name="bio" rows={3} maxLength={160} defaultValue={bio} placeholder="e.g. Poker, five-a-side and finding the best ramen near Holborn" className="input" />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        {state.saved && !pending && <span className="text-sm font-semibold text-ok">Saved ✓</span>}
        {state.error && <span className="text-sm font-medium text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
