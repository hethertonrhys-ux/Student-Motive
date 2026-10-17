"use client";

import { useActionState, useState } from "react";
import { PlacePicker, type Point } from "@/app/dashboard/[societyId]/where-field";
import { CATEGORIES, type MotiveEvent } from "@/lib/types";
import type { HostState } from "./actions";

type Props = {
  action: (state: HostState, formData: FormData) => Promise<HostState>;
  event?: MotiveEvent;
  exact?: { address: string | null; lat: number | null; lng: number | null } | null;
  startsAtInput?: string;
  endsAtInput?: string;
};

// The form a student uses to host their own event.
export function HostForm({ action, event, exact, startsAtInput, endsAtInput }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const [pin, setPin] = useState<Point | null>(exact?.lat != null && exact?.lng != null ? { lat: exact.lat, lng: exact.lng } : null);
  const [area, setArea] = useState(event?.location_note ?? "");
  const [address, setAddress] = useState(exact?.address ?? "");
  const [visibility, setVisibility] = useState(event?.visibility ?? "public");
  const [joinMode, setJoinMode] = useState(event?.join_mode ?? "open");

  return (
    <form action={formAction} className="card space-y-6">
      <div>
        <label htmlFor="title" className="label">What&apos;s the plan?</label>
        <input id="title" name="title" required maxLength={120} defaultValue={event?.title} placeholder="e.g. Pres before Zoo Bar, Sunday league kickabout" className="input" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="category" className="label">Category</label>
          <select id="category" name="category" required defaultValue={event?.category ?? ""} className="input">
            <option value="" disabled>Choose…</option>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-3 self-end rounded-xl border border-line px-3.5 py-2.5">
          <input type="checkbox" name="free_food" defaultChecked={event?.free_food} className="size-5 accent-[var(--brand)]" />
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

      <fieldset className="space-y-3">
        <legend className="label">Where</legend>
        <PlacePicker
          pin={pin}
          onPick={(point, name, detail) => {
            setPin(point);
            if (!address.trim() && name) setAddress([name, detail].filter(Boolean).join(", "));
            if (!area.trim()) {
              const district = detail?.split(",").map((s) => s.trim()).find((s) => s && !/^\d/.test(s) && s !== name && s !== "London");
              if (district) setArea(`Near ${district}`);
            }
          }}
        />
        <div>
          <label htmlFor="area" className="label">Area everyone sees</label>
          <input id="area" name="area" required maxLength={120} value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Near Holborn" className="input" />
          <p className="mt-1 text-xs text-muted">The map shows a rough spot, not your exact location.</p>
        </div>
        <div>
          <label htmlFor="address" className="label">
            Exact address <span className="font-normal text-muted">(only people going see this)</span>
          </label>
          <input id="address" name="address" maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Flat 3, 10 Example Street. Buzz 3." className="input" />
        </div>
        <input type="hidden" name="lat" value={pin ? pin.lat.toFixed(6) : ""} />
        <input type="hidden" name="lng" value={pin ? pin.lng.toFixed(6) : ""} />
      </fieldset>

      <fieldset>
        <legend className="label">Who can see it?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice name="visibility" value="public" checked={visibility === "public"} onChange={() => setVisibility("public")} title="🌍 Everyone" help="On the live map for all students" />
          <Choice name="visibility" value="friends" checked={visibility === "friends"} onChange={() => setVisibility("friends")} title="👥 Friends only" help="Only your friends can see and join" />
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">How do people join?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice name="join_mode" value="open" checked={joinMode === "open"} onChange={() => setJoinMode("open")} title="Anyone can join" help="They tap “I'm going” and they're in" />
          <Choice name="join_mode" value="approval" checked={joinMode === "approval"} onChange={() => setJoinMode("approval")} title="I approve requests" help="You choose who comes" />
        </div>
      </fieldset>

      <div>
        <label htmlFor="capacity" className="label">
          Guest limit <span className="font-normal text-muted">(optional)</span>
        </label>
        <input id="capacity" name="capacity" type="number" inputMode="numeric" min={1} max={500} defaultValue={event?.capacity ?? ""} placeholder="No limit" className="input w-40" />
        <p className="mt-1 text-xs text-muted">Not counting you. Extra people go on a waiting list.</p>
      </div>

      <div>
        <label htmlFor="description" className="label">
          Details <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea id="description" name="description" rows={4} maxLength={5000} defaultValue={event?.description ?? ""} placeholder="What to bring, dress code, who it's for…" className="input" />
      </div>

      <p className="rounded-xl bg-brand-soft px-4 py-3 text-sm">
        Be safe: meet in public places when hosting people you don&apos;t know, and share your plans with a friend.
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
