"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { CATEGORIES, type EventCategory } from "@/lib/types";

// The classic "filter" icon: three centred lines, each shorter than the one
// above. Heroicons doesn't include this shape, so it's drawn here with the
// same 24px grid, 1.5 stroke and rounded ends as Heroicons outline icons.
export function FilterIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M6.75 12h10.5m-7.5 5.25h4.5" />
    </svg>
  );
}

// ---- Remembering the chosen categories on this device ----

const KEY = "function-map-categories";
const listeners = new Set<() => void>();
const VALID = new Set(CATEGORIES.map((c) => c.value));

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

export function useSavedCategories(): [EventCategory[], (next: EventCategory[]) => void] {
  const raw = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => "[]",
  );
  let parsed: EventCategory[] = [];
  try {
    parsed = (JSON.parse(raw) as EventCategory[]).filter((c) => VALID.has(c));
  } catch {}
  const set = (next: EventCategory[]) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
    listeners.forEach((l) => l());
  };
  return [parsed, set];
}

// ---- The filter button and its panel ----

export function FilterButton({ count, open, onClick }: { count: number; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count ? `Filter by category, ${count} selected` : "Filter by category"}
      aria-expanded={open}
      className={`relative grid size-10 shrink-0 max-[359px]:size-9 place-items-center rounded-full border shadow-lg transition ${
        open || count ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-ink"
      }`}
    >
      <FilterIcon className="size-6" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] leading-5 font-bold text-brand-ink ring-2 ring-[var(--surface)]">
          {count}
        </span>
      )}
    </button>
  );
}

export function FilterPanel({
  selected,
  onChange,
  onClose,
}: {
  selected: EventCategory[];
  onChange: (next: EventCategory[]) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (value: EventCategory) =>
    onChange(selected.includes(value) ? selected.filter((c) => c !== value) : [...selected, value]);

  return (
    <>
      {/* Tapping anywhere outside the panel closes it. */}
      <button type="button" aria-label="Close filters" onClick={onClose} className="pointer-events-auto fixed inset-0 z-10 cursor-default" />
      <div
        ref={panel}
        role="dialog"
        aria-label="Filter by category"
        className="pointer-events-auto absolute top-full right-3 z-20 mt-2 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl border border-line bg-surface p-2 shadow-xl"
      >
        <div className="flex items-center justify-between px-2 pt-1 pb-2">
          <p className="font-display font-bold">Categories</p>
          <span className="flex gap-3 text-sm font-semibold">
            <button type="button" onClick={() => onChange(CATEGORIES.map((c) => c.value))} className="text-brand">Select all</button>
            <button type="button" onClick={() => onChange([])} className="text-muted hover:text-ink">Clear</button>
          </span>
        </div>
        <ul className="border-y border-line py-1">
          {CATEGORIES.map((c) => (
            <li key={c.value}>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-brand-soft">
                <input
                  type="checkbox"
                  checked={selected.includes(c.value)}
                  onChange={() => toggle(c.value)}
                  className="size-5 accent-[var(--brand)]"
                />
                <span className="font-semibold">{c.label}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-2 px-2 pt-2">
          <p className="text-xs text-muted">{selected.length === 0 ? "Nothing ticked: showing everything" : `${selected.length} selected`}</p>
          <button type="button" onClick={onClose} className="btn py-1.5">Done</button>
        </div>
      </div>
    </>
  );
}

// ---- Search ----

export function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Search events"
      className="grid size-10 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink shadow-lg max-[359px]:size-9"
    >
      <MagnifyingGlassIcon className="size-6" aria-hidden="true" />
    </button>
  );
}

export function SearchBar({ value, onChange, onCancel }: { value: string; onChange: (v: string) => void; onCancel: () => void }) {
  return (
    <div className="pointer-events-auto flex items-center gap-2">
      <div className="relative flex-1">
        <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
          autoFocus
          enterKeyHint="search"
          placeholder="Event, society or place"
          aria-label="Search events by name, society or place"
          className="h-11 w-full rounded-full border border-line bg-surface pr-10 pl-11 shadow-lg focus:border-brand focus:outline-none"
        />
        {value && (
          <button type="button" onClick={() => onChange("")} aria-label="Clear search" className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted">
            <XMarkIcon className="size-5" aria-hidden="true" />
          </button>
        )}
      </div>
      <button type="button" onClick={onCancel} className="rounded-full bg-surface px-3.5 py-2.5 text-sm font-bold shadow-lg">
        Cancel
      </button>
    </div>
  );
}

// Lower case, no accents or punctuation, so "kings" finds "King's".
export const normalise = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
