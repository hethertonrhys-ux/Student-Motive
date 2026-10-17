"use client";

import { useState } from "react";
import { DEFAULT_SEATS, FORMATS, POKER_STAKES, type EventFormat, type EventTable } from "@/lib/types";

type TableDraft = { id?: string; name: string; level: string; seats: number };

type Props = {
  format?: EventFormat;
  capacity?: number | null;
  membersOnly?: boolean;
  tables?: EventTable[];
};

// The "How do people join?" part of the event form.
export function FormatFields({ format: initialFormat = "standard", capacity, membersOnly = true, tables = [] }: Props) {
  const [format, setFormat] = useState<EventFormat>(initialFormat);
  const [drafts, setDrafts] = useState<TableDraft[]>(
    tables.length > 0
      ? tables.map((t) => ({ id: t.id, name: t.name, level: t.level ?? "", seats: t.seats }))
      : [{ name: "Table 1", level: "Free", seats: DEFAULT_SEATS }],
  );

  function update(index: number, change: Partial<TableDraft>) {
    setDrafts((current) => current.map((t, i) => (i === index ? { ...t, ...change } : t)));
  }

  function addTable() {
    setDrafts((current) => [
      ...current,
      { name: `Table ${current.length + 1}`, level: current.at(-1)?.level ?? "", seats: current.at(-1)?.seats ?? DEFAULT_SEATS },
    ]);
  }

  return (
    <fieldset className="space-y-4 rounded-2xl border border-line p-4">
      <legend className="px-1 font-semibold">How do people join?</legend>

      <div className="grid gap-2 sm:grid-cols-3">
        {FORMATS.map((f) => (
          <label
            key={f.value}
            className={`cursor-pointer rounded-xl border p-3 transition ${
              format === f.value ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-brand"
            }`}
          >
            <input
              type="radio"
              name="format"
              value={f.value}
              checked={format === f.value}
              onChange={() => setFormat(f.value)}
              className="sr-only"
            />
            <span className="block font-bold">{f.label}</span>
            <span className="block text-xs text-muted">{f.help}</span>
          </label>
        ))}
      </div>

      {format === "entries" && (
        <div className="max-w-xs">
          <label htmlFor="capacity" className="label">
            Maximum entries <span className="font-normal text-muted">(optional)</span>
          </label>
          <input id="capacity" name="capacity" type="number" min={1} max={2000} defaultValue={capacity ?? ""} placeholder="No limit" className="input" />
          <p className="mt-1 text-xs text-muted">When it&apos;s full, new entries go on a waiting list and move up if someone drops out.</p>
        </div>
      )}

      {format === "tables" && (
        <div className="space-y-3">
          <datalist id="table-levels">
            {POKER_STAKES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          {drafts.map((table, i) => (
            <div key={table.id ?? `new-${i}`} className="grid grid-cols-[1fr_1fr_5rem_auto] items-end gap-2">
              <div>
                {i === 0 && <span className="label">Table</span>}
                <input value={table.name} onChange={(e) => update(i, { name: e.target.value })} maxLength={40} className="input" aria-label="Table name" />
              </div>
              <div>
                {i === 0 && <span className="label">Level / stakes</span>}
                <input
                  value={table.level}
                  onChange={(e) => update(i, { level: e.target.value })}
                  list="table-levels"
                  maxLength={40}
                  placeholder="e.g. 10p/20p"
                  className="input"
                  aria-label="Level or stakes"
                />
              </div>
              <div>
                {i === 0 && <span className="label">Seats</span>}
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={table.seats}
                  onChange={(e) => update(i, { seats: Number(e.target.value) })}
                  className="input"
                  aria-label="Seats"
                />
              </div>
              <button
                type="button"
                onClick={() => setDrafts((current) => current.filter((_, j) => j !== i))}
                disabled={drafts.length === 1}
                className="mb-1 rounded-lg px-2 py-2 text-sm font-semibold text-danger disabled:opacity-30"
                aria-label={`Remove ${table.name}`}
              >
                Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={addTable} className="btn-ghost py-2 text-sm">
            + Add a table
          </button>
          {tables.length > 0 && (
            <p className="text-xs text-muted">Removing a table moves anyone sitting there back to &ldquo;no table yet&rdquo;.</p>
          )}
        </div>
      )}

      <input type="hidden" name="tables_json" value={format === "tables" ? JSON.stringify(drafts) : "[]"} />

      <label className="flex items-start gap-3">
        <input type="checkbox" name="members_only" defaultChecked={membersOnly} className="mt-1 size-4 accent-[var(--brand)]" />
        <span>
          <span className="font-semibold">Members only</span>
          <span className="block text-xs text-muted">Anyone can see the event, but only approved members can join.</span>
        </span>
      </label>
    </fieldset>
  );
}
