"use client";

import { useEffect, useState } from "react";
import { FriendButton } from "@/components/friend-button";
import { PersonRow } from "@/components/person-row";
import { searchPeople, type SearchResult } from "./actions";

export function PeopleSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Search after a short pause in typing.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let stale = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      const found = await searchPeople(q);
      if (!stale) {
        setResults(found);
        setSearching(false);
      }
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  const showing = query.trim().length >= 2;

  return (
    <div>
      <div className="relative">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find people by name"
          aria-label="Find people by name"
          autoComplete="off"
          className="input pl-11"
        />
      </div>
      {showing && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {searching && !results && <li className="px-4 py-3 text-sm text-muted">Searching…</li>}
          {results?.length === 0 && <li className="px-4 py-3 text-sm text-muted">Nobody called &ldquo;{query.trim()}&rdquo; yet.</li>}
          {results?.map((p) => (
            <PersonRow key={p.id} id={p.id} name={p.name} avatarUrl={p.avatar_url} detail={p.course}>
              <FriendButton id={p.id} relation={p.relation} compact />
            </PersonRow>
          ))}
        </ul>
      )}
    </div>
  );
}
