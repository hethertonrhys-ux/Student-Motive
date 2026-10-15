"use client";

import { useActionState } from "react";
import { CATEGORIES, type MotiveEvent, type Venue } from "@/lib/types";
import type { FormState } from "./actions";

const VENUE_GROUPS: { kind: Venue["kind"]; label: string }[] = [
  { kind: "campus", label: "LSE campus" },
  { kind: "hall", label: "LSE halls" },
  { kind: "university", label: "Other universities" },
  { kind: "club", label: "Clubs & bars" },
  { kind: "other", label: "Other" },
];

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  venues: Venue[];
  event?: MotiveEvent;
  // Times already converted to "YYYY-MM-DDTHH:mm" UK time.
  startsAtInput?: string;
  endsAtInput?: string;
};

export function EventForm({ action, venues, event, startsAtInput, endsAtInput }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const isEdit = Boolean(event);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="title" className="label">Event name</label>
        <input id="title" name="title" required maxLength={120} defaultValue={event?.title} placeholder="e.g. Freshers' Poker Night" className="input" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="category" className="label">Category</label>
          <select id="category" name="category" required defaultValue={event?.category ?? ""} className="input">
            <option value="" disabled>Choose…</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-3 self-end rounded-xl border border-line bg-surface px-3.5 py-2.5">
          <input type="checkbox" name="free_food" defaultChecked={event?.free_food} className="size-4 accent-[var(--brand)]" />
          <span className="font-semibold">Free food 🍕</span>
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="starts_at" className="label">Starts</label>
          <input id="starts_at" name="starts_at" type="datetime-local" required defaultValue={startsAtInput} className="input" />
        </div>
        <div>
          <label htmlFor="ends_at" className="label">Ends</label>
          <input id="ends_at" name="ends_at" type="datetime-local" required defaultValue={endsAtInput} className="input" />
        </div>
      </div>
      <p className="-mt-3 text-xs text-muted">UK time.</p>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="venue_id" className="label">Where</label>
          <select id="venue_id" name="venue_id" required defaultValue={event?.venue_id ?? ""} className="input">
            <option value="" disabled>Choose a place…</option>
            {VENUE_GROUPS.map((group) => {
              const options = venues.filter((v) => v.kind === group.kind);
              if (options.length === 0) return null;
              return (
                <optgroup key={group.kind} label={group.label}>
                  {options.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}{v.short_name ? ` (${v.short_name})` : ""}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>
        <div>
          <label htmlFor="location_note" className="label">
            Room or details <span className="font-normal text-muted">(optional)</span>
          </label>
          <input id="location_note" name="location_note" maxLength={120} defaultValue={event?.location_note ?? ""} placeholder="e.g. 4th floor, room 4.02" className="input" />
        </div>
      </div>

      <div>
        <label htmlFor="description" className="label">
          Description <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea id="description" name="description" rows={5} maxLength={5000} defaultValue={event?.description ?? ""} placeholder="What's happening, who it's for, what to bring…" className="input" />
      </div>

      <div>
        <label htmlFor="ticket_url" className="label">
          Ticket or sign-up link <span className="font-normal text-muted">(optional)</span>
        </label>
        <input id="ticket_url" name="ticket_url" type="text" inputMode="url" defaultValue={event?.ticket_url ?? ""} placeholder="https://…" className="input" />
      </div>

      <div>
        <label htmlFor="image" className="label">
          Image <span className="font-normal text-muted">(optional · JPG, PNG or WebP, under 5MB)</span>
        </label>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {event?.image_url && <img src={event.image_url} alt="" className="mb-3 h-32 rounded-xl object-cover" />}
        <input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp" className="input file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-1 file:font-semibold file:text-brand" />
        {event?.image_url && (
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" name="remove_image" className="accent-[var(--brand)]" /> Remove current image
          </label>
        )}
      </div>

      {isEdit && (
        <label className="flex items-center gap-3 rounded-xl border border-danger/40 bg-danger/5 px-3.5 py-2.5">
          <input type="checkbox" name="is_cancelled" defaultChecked={event?.is_cancelled} className="size-4 accent-[var(--danger)]" />
          <span className="font-semibold text-danger">Mark as cancelled</span>
        </label>
      )}

      {state.error && <p className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm font-medium text-danger">{state.error}</p>}

      <button className="btn w-full sm:w-auto" disabled={pending}>
        {pending ? "Saving…" : isEdit ? "Save changes" : "Post event"}
      </button>
    </form>
  );
}
