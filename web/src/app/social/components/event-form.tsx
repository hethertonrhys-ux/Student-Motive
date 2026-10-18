"use client";

import { useActionState, useState } from "react";
import { SOCIAL_CATEGORIES, type SocialEvent } from "@/lib/social-events";
import type { FormState } from "../actions";
import { PlacePicker, type Point } from "@/components/place-picker";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  event?: SocialEvent;
  exact?: { address: string | null; lat: number | null; lng: number | null } | null;
  // UK-time values for the date and time inputs when editing.
  defaults?: { date: string; start: string; finish: string };
};

export function EventForm({ action, event, exact, defaults }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const [pin, setPin] = useState<Point | null>(exact?.lat != null && exact?.lng != null ? { lat: exact.lat, lng: exact.lng } : null);
  const [area, setArea] = useState(event?.area ?? "");
  const [address, setAddress] = useState(exact?.address ?? "");
  const [category, setCategory] = useState(event?.category ?? "");
  const [privacy, setPrivacy] = useState(event?.is_private ? "private" : "open");

  return (
    <form action={formAction} className="space-y-6">
      <div>
        <label htmlFor="title" className="label">Title</label>
        <input id="title" name="title" required maxLength={120} defaultValue={event?.title} placeholder="e.g. Powerleague 5-a-side" className="input" />
      </div>

      <fieldset>
        <legend className="label">Category</legend>
        <div className="flex flex-wrap gap-2">
          {SOCIAL_CATEGORIES.map((c) => (
            <label
              key={c.value}
              className={`cursor-pointer rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
                category === c.value ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface hover:border-brand/50"
              }`}
            >
              <input type="radio" name="category" value={c.value} checked={category === c.value} onChange={() => setCategory(c.value)} className="sr-only" required />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="description" className="label">Description</label>
        <textarea id="description" name="description" rows={4} maxLength={3000} defaultValue={event?.description ?? ""} placeholder="What's the plan? Who's it for? What should people bring?" className="input" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="date" className="label">Date</label>
          <input id="date" name="date" type="date" required defaultValue={defaults?.date} className="input" />
        </div>
        <div>
          <label htmlFor="start_time" className="label">Start time</label>
          <input id="start_time" name="start_time" type="time" required defaultValue={defaults?.start} className="input" />
        </div>
        <div>
          <label htmlFor="finish_time" className="label">
            Finish <span className="font-normal text-muted">(optional)</span>
          </label>
          <input id="finish_time" name="finish_time" type="time" defaultValue={defaults?.finish} className="input" />
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="label">Location</legend>
        <PlacePicker
          pin={pin}
          onPick={(point, name, detail) => {
            setPin(point);
            if (!area.trim() && name) setArea(name);
            if (!address.trim() && name) setAddress([name, detail].filter(Boolean).join(", "));
          }}
        />
        <div>
          <label htmlFor="area" className="label">Place name everyone sees</label>
          <input id="area" name="area" required maxLength={120} value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Powerleague Shoreditch, or Near Holborn" className="input" />
          <p className="mt-1 text-xs text-muted">The map shows a rough spot. Hosting at home? Put the area here, not your address.</p>
        </div>
        <div>
          <label htmlFor="address" className="label">
            Exact address <span className="font-normal text-muted">(only people going see this)</span>
          </label>
          <input id="address" name="address" maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Flat 3, 10 Example Street" className="input" />
        </div>
        <input type="hidden" name="lat" value={pin ? pin.lat.toFixed(6) : ""} />
        <input type="hidden" name="lng" value={pin ? pin.lng.toFixed(6) : ""} />
      </fieldset>

      <div>
        <label htmlFor="spaces" className="label">Number of spaces</label>
        <input id="spaces" name="spaces" type="number" inputMode="numeric" required min={2} max={500} defaultValue={event?.spaces ?? 8} className="input w-32" />
        <p className="mt-1 text-xs text-muted">Including you. 8 spaces = you + 7 others.</p>
      </div>

      <fieldset>
        <legend className="label">Open or Private?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice name="privacy" value="open" checked={privacy === "open"} onChange={() => setPrivacy("open")} title="Open" help="Anyone can tap “I'm in” and join straight away" />
          <Choice name="privacy" value="private" checked={privacy === "private"} onChange={() => setPrivacy("private")} title="Private" help="People request to join; you approve or decline" />
        </div>
      </fieldset>

      <label className="flex items-start gap-3 rounded-xl border border-line px-3.5 py-3">
        <input type="checkbox" name="friends_only" defaultChecked={event?.friends_only} className="mt-0.5 size-5 accent-[var(--brand)]" />
        <span>
          <span className="block font-semibold">Only my friends can see this</span>
          <span className="block text-sm text-muted">Hidden from everyone else in Discover.</span>
        </span>
      </label>

      <p className="rounded-xl bg-brand-soft px-4 py-3 text-sm">
        Stay safe: meet people you don&apos;t know in public places, and tell a friend where you&apos;re going.
      </p>

      {state.error && <p className="text-sm font-medium text-danger">{state.error}</p>}
      <button className="btn w-full py-3 text-base" disabled={pending}>
        {pending ? "Saving…" : event ? "Save changes" : "Post event"}
      </button>
    </form>
  );
}

function Choice(props: { name: string; value: string; checked: boolean; onChange: () => void; title: string; help: string }) {
  return (
    <label className={`cursor-pointer rounded-xl border px-3.5 py-3 transition ${props.checked ? "border-brand bg-brand-soft" : "border-line hover:border-brand/50"}`}>
      <input type="radio" name={props.name} value={props.value} checked={props.checked} onChange={props.onChange} className="sr-only" />
      <span className="block font-semibold">{props.title}</span>
      <span className="block text-sm text-muted">{props.help}</span>
    </label>
  );
}
