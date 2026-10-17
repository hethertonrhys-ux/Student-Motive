"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { SOCIAL_CATEGORIES } from "@/lib/social-events";

// Discover filters. They live in the web address, so a filtered list can be shared.
export function Filters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const category = params.get("category") ?? "";
  const date = params.get("date") ?? "";
  const type = params.get("type") ?? "";
  const available = params.get("available") === "1";
  const picked = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";

  function set(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  // Search as you type, after a short pause.
  useEffect(() => {
    if ((params.get("q") ?? "") === q.trim()) return;
    const t = setTimeout(() => set({ q: q.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
      active ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-ink hover:border-brand/50"
    }`;
  const anyFilter = category || date || type || available || q;

  return (
    <div className={`space-y-3 ${pending ? "opacity-70" : ""}`}>
      <div className="relative">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search events"
          aria-label="Search event titles"
          className="input pl-11"
        />
      </div>

      {/* Category */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <button type="button" onClick={() => set({ category: null })} className={chip(!category)}>All</button>
        {SOCIAL_CATEGORIES.map((c) => (
          <button key={c.value} type="button" onClick={() => set({ category: category === c.value ? null : c.value })} className={chip(category === c.value)}>
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      {/* Date, type and spaces */}
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <button type="button" onClick={() => set({ date: date === "today" ? null : "today" })} className={chip(date === "today")}>Today</button>
        <button type="button" onClick={() => set({ date: date === "week" ? null : "week" })} className={chip(date === "week")}>This week</button>
        <label className={`${chip(Boolean(picked))} relative cursor-pointer`}>
          📅 {picked ? new Date(`${picked}T12:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "Pick a date"}
          <input
            type="date"
            value={picked}
            onChange={(e) => set({ date: e.target.value || null })}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Pick a date"
          />
        </label>
        <span className="mx-1 h-6 w-px shrink-0 bg-line" />
        <button type="button" onClick={() => set({ type: type === "open" ? null : "open" })} className={chip(type === "open")}>Open only</button>
        <button type="button" onClick={() => set({ type: type === "private" ? null : "private" })} className={chip(type === "private")}>Private only</button>
        <button type="button" onClick={() => set({ available: available ? null : "1" })} className={chip(available)}>Spaces available</button>
      </div>

      {anyFilter && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            set({ category: null, date: null, type: null, available: null, q: null });
          }}
          className="text-sm font-semibold text-brand"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
