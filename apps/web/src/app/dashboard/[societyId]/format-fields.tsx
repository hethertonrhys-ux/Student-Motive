"use client";

import { useState } from "react";
import { DEFAULT_SEATS, FORMATS, POKER_STAKES, type EventFormat, type EventTable } from "@/lib/types";
import { AUDIENCES, audienceLabel, uniShort, type Audience } from "@/lib/universities";

type TableDraft = { id?: string; name: string; level: string; seats: number };

type Props = {
  format?: EventFormat;
  capacity?: number | null;
  membersOnly?: boolean;
  audience?: Audience;
  uni: string;
  tables?: EventTable[];
};

const AUDIENCE_HELP: Record<Audience, (uni: string) => string> = {
  members: () => "Only your approved members can see and join it.",
  uni: (uni) => `Every ${uni} student can see it.`,
  london: () => "Students from LSE, UCL, King's and Imperial can see and join it.",
};

// The "How do people join?" part of the event form.
export function FormatFields({ format: initialFormat = "standard", capacity, membersOnly = true, audience: initialAudience = "uni", uni, tables = [] }: Props) {
  const [format, setFormat] = useState<EventFormat>(initialFormat);
  const [audience, setAudience] = useState<Audience>(initialAudience);
  const [drafts, setDrafts] = useState<TableDraft[]>(
    tables.length > 0
      ? tables.map((t) => ({ id: t.id, name: t.name, level: t.level ?? "", seats: t.seats }))
      : [{ name: "Table 1", level: "", seats: DEFAULT_SEATS }],
  );

  function update(index: number, change: Partial<TableDraft>) {
    setDrafts((current) => current.map((t, i) => (i === index ? { ...t, ...change } : t)));
  }

  function addTable() {
    setDrafts((current) => [
      ...current,
      { name: `Table ${current.length + 1}`, level: "", seats: current.at(-1)?.seats ?? DEFAULT_SEATS },
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
          {drafts.map((table, i) => (
            <div key={table.id ?? `new-${i}`} className="grid grid-cols-[1fr_1fr_5rem_auto] items-end gap-2">
              <div>
                {i === 0 && <span className="label">Table</span>}
                <input value={table.name} onChange={(e) => update(i, { name: e.target.value })} maxLength={40} className="input" aria-label="Table name" />
              </div>
              <div>
                {i === 0 && <span className="label">Level / stakes</span>}
                <LevelPicker value={table.level} onChange={(level) => update(i, { level })} />
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

      <div role="radiogroup" aria-label="Who can see this event" className="space-y-2">
        <p className="font-semibold">Who can see this event</p>
        {AUDIENCES.map((a) => (
          <label key={a} className="flex items-start gap-3">
            <input type="radio" name="audience" value={a} checked={audience === a} onChange={() => setAudience(a)} className="mt-1 size-4 accent-[var(--brand)]" />
            <span>
              <span className="font-semibold">{audienceLabel(a, uni)}</span>
              <span className="block text-xs text-muted">{AUDIENCE_HELP[a](uniShort(uni))}</span>
            </span>
          </label>
        ))}
      </div>

      {audience === "members" ? (
        <input type="hidden" name="members_only" value="on" />
      ) : (
        <label className="flex items-start gap-3">
          <input type="checkbox" name="members_only" defaultChecked={membersOnly} className="mt-1 size-4 accent-[var(--brand)]" />
          <span>
            <span className="font-semibold">Only members can join</span>
            <span className="block text-xs text-muted">Others can see the event, but only approved members can join.</span>
          </span>
        </label>
      )}
    </fieldset>
  );
}

// Stakes dropdown, with "Other…" for typing your own (e.g. for non-poker events).
function LevelPicker({ value, onChange }: { value: string; onChange: (level: string) => void }) {
  const isPreset = value === "" || POKER_STAKES.includes(value);
  const [custom, setCustom] = useState(!isPreset);

  if (custom) {
    return (
      <div className="flex gap-1">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={40}
          placeholder="Type a level"
          autoFocus
          className="input"
          aria-label="Level or stakes"
        />
        <button
          type="button"
          onClick={() => { setCustom(false); onChange(""); }}
          className="shrink-0 px-1 text-sm font-semibold text-muted"
          aria-label="Back to the list"
        >
          ↩
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === "__other") { setCustom(true); onChange(""); } else onChange(e.target.value);
      }}
      className={`input ${value === "" ? "text-muted/70" : ""}`}
      aria-label="Level or stakes"
    >
      <option value="" disabled hidden>e.g. 10p/20p</option>
      {POKER_STAKES.map((stake) => <option key={stake} value={stake} className="text-ink">{stake}</option>)}
      <option value="__other" className="text-ink">Other…</option>
    </select>
  );
}
