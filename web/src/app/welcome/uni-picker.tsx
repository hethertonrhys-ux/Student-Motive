"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UNIVERSITIES, type UniId } from "@/lib/universities";
import { setMyUni } from "./actions";

// For people invited with a non-uni email: which uni are they at?
export function UniPicker({ current }: { current: UniId }) {
  const router = useRouter();
  const [chosen, setChosen] = useState(current);
  const [, start] = useTransition();
  return (
    <div className="mt-3">
      <p className="text-sm font-semibold text-muted">Which uni are you at?</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {UNIVERSITIES.map((u) => (
          <button
            key={u.id}
            type="button"
            aria-pressed={chosen === u.id}
            onClick={() => {
              setChosen(u.id);
              start(async () => {
                await setMyUni(u.id);
                router.refresh();
              });
            }}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
              chosen === u.id ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface hover:border-brand"
            }`}
          >
            {u.short}
          </button>
        ))}
      </div>
    </div>
  );
}
