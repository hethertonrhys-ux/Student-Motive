"use client";

import { useState, useTransition } from "react";
import { setShowSocieties } from "./my-five-actions";

export function ShowSocietiesToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block font-semibold">Show my societies on my profile</span>
        <span className="block text-sm text-muted">Societies you&apos;re a member of or on the committee of.</span>
      </span>
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          start(async () => {
            const r = await setShowSocieties(next);
            if (r.error) setOn(!next);
          });
        }}
        className="mt-1 size-5 shrink-0 accent-[var(--brand)]"
      />
    </label>
  );
}
