"use client";

import { useState, useTransition } from "react";
import { guessTwoTruths } from "@/app/account/actions";
import type { TwoTruthsView } from "@/lib/two-truths";

// Someone's Two truths and a lie: tap the one you think is the lie (one go),
// then see the answer and how many people got it right. The lie isn't sent
// to your phone until you've guessed.
export function TwoTruthsGame({ person, initial }: { person: string; initial: TwoTruthsView }) {
  const [view, setView] = useState(initial);
  const [picking, setPicking] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const revealed = view.lie !== null;
  const pct = view.total ? Math.round(((view.right ?? 0) / view.total) * 100) : null;

  function guess(n: number) {
    setPicking(n);
    start(async () => {
      const next = await guessTwoTruths(person, n);
      if (next) setView(next);
      setPicking(null);
    });
  }

  return (
    <div>
      {!revealed && <p className="mb-1.5 text-xs font-semibold text-brand">Tap the one you think is the lie</p>}
      <ul className="space-y-1.5">
        {view.statements.map((s) => {
          const isLie = revealed && s.n === view.lie;
          const mine = view.my_pick === s.n;
          return (
            <li key={s.n}>
              {revealed ? (
                <div
                  className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                    isLie ? "bg-danger/10 text-danger" : "bg-surface"
                  }`}
                >
                  <span className="[overflow-wrap:anywhere]">{s.text}</span>
                  <span className="shrink-0 text-[11px] font-bold">
                    {isLie ? "Lie" : "True"}
                    {mine && !view.own ? " · your pick" : ""}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => guess(s.n)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm font-semibold transition [overflow-wrap:anywhere] ${
                    picking === s.n ? "border-brand bg-surface" : "border-line bg-surface hover:border-brand"
                  }`}
                >
                  {s.text}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {revealed && (
        <p className="mt-2 text-xs font-semibold text-muted">
          {view.own
            ? view.total
              ? `${view.total} ${view.total === 1 ? "person has" : "people have"} played · ${pct}% guessed right`
              : "Nobody has played yet."
            : `${view.my_pick === view.lie ? "You got it!" : "Not quite."} ${pct}% guessed right (${view.total} played)`}
        </p>
      )}
    </div>
  );
}
