"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SOCIAL_CATEGORIES } from "@/lib/social-events";

type Menu = "category" | "date" | "type" | null;

// Discover search and filters. Only the search bar shows until you tap it;
// then the filters appear underneath. Everything lives in the web address,
// so a filtered list can be shared. Changing them doesn't ask the server:
// the list underneath narrows straight away.
export function Filters() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<Menu>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const category = params.get("category") ?? "";
  const date = params.get("date") ?? "";
  const type = params.get("type") ?? "";
  const available = params.get("available") === "1";
  const picked = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
  const filterCount = [category, date, type, available].filter(Boolean).length;

  function set(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const query = next.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }
  const clearFilters = () => set({ category: null, date: null, type: null, available: null });

  function close() {
    setOpen(false);
    setMenu(null);
    inputRef.current?.blur();
  }


  // Tapping anywhere outside, or pressing Escape, closes the filters.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) close();
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
      active ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-ink hover:border-brand/50"
    }`;
  const categoryLabel = SOCIAL_CATEGORIES.find((c) => c.value === category)?.label;
  const dateLabel =
    date === "today" ? "Today" : date === "week" ? "This week" : picked ? new Date(`${picked}T12:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
  const typeLabel = type === "open" ? "Open only" : type === "private" ? "Private only" : "";
  const pick = (changes: Record<string, string | null>) => {
    set(changes);
    setMenu(null);
  };

  return (
    <div ref={boxRef} className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              set({ q: e.target.value.trim() || null });
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search events"
            aria-label="Search events by name or place"
            className={`input pl-11 ${!open && filterCount ? "pr-32" : ""}`}
          />
          {/* Filters still on after closing: say so, with a quick way to clear them. */}
          {!open && filterCount > 0 && (
            <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center rounded-full bg-brand-soft text-xs font-bold text-brand">
              <button type="button" onClick={() => inputRef.current?.focus()} className="py-1.5 pr-1 pl-3">
                {filterCount} {filterCount === 1 ? "filter" : "filters"}
              </button>
              <button type="button" onClick={clearFilters} aria-label="Clear filters" className="grid size-7 place-items-center rounded-full text-base leading-none hover:bg-brand/10">
                ×
              </button>
            </span>
          )}
        </div>
        {open && (
          <button type="button" onClick={close} className="shrink-0 px-1 text-sm font-semibold text-brand">
            Cancel
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-expanded={menu === "category"} onClick={() => setMenu(menu === "category" ? null : "category")} className={chip(Boolean(category))}>
              {categoryLabel ?? "Category"}
            </button>
            <button type="button" aria-expanded={menu === "date"} onClick={() => setMenu(menu === "date" ? null : "date")} className={chip(Boolean(date))}>
              {dateLabel || "Date"}
            </button>
            <button type="button" aria-expanded={menu === "type"} onClick={() => setMenu(menu === "type" ? null : "type")} className={chip(Boolean(type))}>
              {typeLabel || "Open/Private"}
            </button>
            <button type="button" aria-pressed={available} onClick={() => set({ available: available ? null : "1" })} className={chip(available)}>
              Spaces available
            </button>
          </div>

          {menu === "category" && (
            <div className="flex flex-wrap gap-2 rounded-2xl border border-line bg-surface p-3">
              <button type="button" onClick={() => pick({ category: null })} className={chip(!category)}>All</button>
              {SOCIAL_CATEGORIES.map((c) => (
                <button key={c.value} type="button" onClick={() => pick({ category: c.value })} className={chip(category === c.value)}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {menu === "date" && (
            <div className="flex flex-wrap gap-2 rounded-2xl border border-line bg-surface p-3">
              <button type="button" onClick={() => pick({ date: null })} className={chip(!date)}>Any day</button>
              <button type="button" onClick={() => pick({ date: "today" })} className={chip(date === "today")}>Today</button>
              <button type="button" onClick={() => pick({ date: "week" })} className={chip(date === "week")}>This week</button>
              <label className={`${chip(Boolean(picked))} relative cursor-pointer`}>
                {picked ? dateLabel : "Pick a date"}
                <input
                  type="date"
                  value={picked}
                  onChange={(e) => pick({ date: e.target.value || null })}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Pick a date"
                />
              </label>
            </div>
          )}
          {menu === "type" && (
            <div className="flex flex-wrap gap-2 rounded-2xl border border-line bg-surface p-3">
              <button type="button" onClick={() => pick({ type: null })} className={chip(!type)}>Both</button>
              <button type="button" onClick={() => pick({ type: "open" })} className={chip(type === "open")}>Open only</button>
              <button type="button" onClick={() => pick({ type: "private" })} className={chip(type === "private")}>Private only</button>
            </div>
          )}

          {filterCount > 0 && (
            <button type="button" onClick={clearFilters} className="text-sm font-semibold text-brand">
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
