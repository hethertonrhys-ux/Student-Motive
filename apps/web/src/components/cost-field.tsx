"use client";

import { useState } from "react";

type Kind = "none" | "free" | "paid";

// The optional "Cost" question on event forms: not said, Free, or a price in
// pounds. Display only; nobody pays through the app.
export function CostField({ pence }: { pence?: number | null }) {
  const [kind, setKind] = useState<Kind>(pence == null ? "none" : pence === 0 ? "free" : "paid");
  const options: { value: Kind; label: string }[] = [
    { value: "none", label: "Don't show" },
    { value: "free", label: "Free" },
    { value: "paid", label: "Costs money" },
  ];
  return (
    <fieldset>
      <legend className="label">
        Cost <span className="font-normal text-muted">(optional)</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`cursor-pointer rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
              kind === o.value ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface hover:border-brand/50"
            }`}
          >
            <input type="radio" name="cost_kind" value={o.value} checked={kind === o.value} onChange={() => setKind(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
      {kind === "paid" && (
        <div className="mt-3 flex items-center gap-2">
          <span className="font-semibold">£</span>
          <input
            name="cost_amount"
            aria-label="Cost in pounds"
            type="text"
            inputMode="decimal"
            required
            // Checked on the phone first, so a typo doesn't send the form.
            pattern="£?\s*\d{1,4}([.]\d{1,2})?"
            title="A price in pounds, e.g. 6 or 6.50"
            defaultValue={pence ? (pence % 100 === 0 ? String(pence / 100) : (pence / 100).toFixed(2)) : ""}
            placeholder="6"
            className="input w-28"
          />
          <span className="text-xs text-muted">per person. Just shown on the event; no payments are taken.</span>
        </div>
      )}
    </fieldset>
  );
}
