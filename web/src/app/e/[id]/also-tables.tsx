"use client";

import { useState, useTransition } from "react";
import type { EventTable } from "@/lib/types";
import { setAlsoTables } from "./actions";

// "I'd also happily play at…" so the committee can fill short tables quickly.
export function AlsoTables({ eventId, tables, myTableId, selected }: { eventId: string; tables: EventTable[]; myTableId: string | null; selected: string[] }) {
  const [chosen, setChosen] = useState<string[]>(selected);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const others = tables.filter((t) => t.id !== myTableId);
  if (others.length === 0) return null;

  function toggle(id: string) {
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
    setChosen(next);
    setError(null);
    start(async () => {
      const result = await setAlsoTables(eventId, next);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="card">
      <p className="font-semibold">Also happy to play at</p>
      <p className="mb-3 text-sm text-muted">Tick any other tables you&apos;d move to. It helps the committee fill tables.</p>
      <div className="flex flex-wrap gap-2">
        {others.map((t) => {
          const on = chosen.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              aria-pressed={on}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                on ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface hover:border-brand"
              }`}
            >
              {on ? "✓ " : ""}
              {t.level || t.name}
              {t.level && <span className={on ? "opacity-80" : "text-muted"}> · {t.name}</span>}
            </button>
          );
        })}
      </div>
      {pending && <p className="mt-2 text-xs text-muted">Saving…</p>}
      {error && <p className="mt-2 text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
