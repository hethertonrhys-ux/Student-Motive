"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import type { OrgKind } from "@/lib/types";

export type SearchableSociety = {
  id: string;
  name: string;
  slug: string;
  kind: OrgKind;
  logo_url: string | null;
  // Your link to it, if any.
  relation: "runs" | "member" | "pending" | null;
};

const KIND_LABEL: Record<OrgKind, string> = {
  society: "Society",
  hall: "Hall",
  university: "University",
  promoter: "Club night",
};

// Lower case, no accents or punctuation, so "Fintech" finds "LSE FinTech Society".
const normalise = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "") // "kings" finds "King's"
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function SocietySearch({ societies }: { societies: SearchableSociety[] }) {
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;

  const results = useMemo(() => {
    const words = normalise(query).split(" ").filter(Boolean);
    if (words.length === 0) return [];
    return societies
      .map((s) => ({ s, name: normalise(s.name) }))
      .filter(({ name }) => words.every((w) => name.includes(w)))
      // Names that start with what you typed come first.
      .sort((a, b) => Number(b.name.startsWith(words[0])) - Number(a.name.startsWith(words[0])) || a.name.localeCompare(b.name))
      .slice(0, 12)
      .map(({ s }) => s);
  }, [societies, query]);

  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-bold">Find a society</h2>
      <div className="relative mt-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search societies, e.g. Poker, Economics, Law"
          aria-label="Search societies"
          autoComplete="off"
          className="input pl-11"
        />
      </div>

      {searching && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {results.map((s) => (
            <li key={s.id}>
              <Link href={`/s/${s.slug}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-brand-soft">
                <Avatar name={s.name} url={s.logo_url} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{s.name}</span>
                  <span className="text-xs text-muted">{KIND_LABEL[s.kind]}</span>
                </span>
                {s.relation && (
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${s.relation === "pending" ? "bg-brand-soft text-brand" : "bg-ok/10 text-ok"}`}>
                    {s.relation === "runs" ? "You run this" : s.relation === "member" ? "Member" : "Awaiting approval"}
                  </span>
                )}
                <span className="shrink-0 text-muted" aria-hidden>›</span>
              </Link>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-4 py-4 text-sm text-muted">
              No society called &ldquo;{query.trim()}&rdquo; on Motive yet.{" "}
              <Link href="/dashboard/claim" className="font-semibold text-brand">
                Run one? Ask to add it →
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
