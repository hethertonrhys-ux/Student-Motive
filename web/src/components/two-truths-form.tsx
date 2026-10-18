"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveTwoTruths } from "@/app/account/actions";
import { exampleFor, promptById, TWO_TRUTHS_ID, type Uni } from "@/lib/prompts";
import { TWO_TRUTHS_HELP, TWO_TRUTHS_MAX, type TwoTruthsOwn } from "@/lib/two-truths";

// Write three statements and mark which one is the lie. Used in the profile
// editor (with a Save button) and on the welcome step (saves by itself once
// all three are filled in and a lie is picked).
export function TwoTruthsForm({
  initial,
  uni,
  autoSave = false,
  placeFirst = false,
  onSaved,
  onCancel,
  onReady,
  focusFirst = false,
}: {
  initial: TwoTruthsOwn | null;
  uni: Uni | null;
  autoSave?: boolean;
  placeFirst?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
  // Tells the welcome step whether it's complete (so Continue can turn on).
  onReady?: (ready: boolean, save: () => Promise<boolean>) => void;
  focusFirst?: boolean;
}) {
  const prompt = promptById(TWO_TRUTHS_ID)!;
  const examples = exampleFor(prompt, uni).split(" · ");
  const [s, setS] = useState<[string, string, string]>(initial ? [initial.s1, initial.s2, initial.s3] : ["", "", ""]);
  const [lie, setLie] = useState<number | null>(initial?.lie ?? null);
  const [status, setStatus] = useState<{ saved?: boolean; error?: string }>({});
  const [pending, start] = useTransition();
  const first = useRef<HTMLInputElement>(null);
  const ready = s.every((t) => t.trim()) && lie !== null;
  const changed = !initial || s[0] !== initial.s1 || s[1] !== initial.s2 || s[2] !== initial.s3 || lie !== initial.lie;

  useEffect(() => {
    if (focusFirst) first.current?.focus();
  }, [focusFirst]);

  async function save(): Promise<boolean> {
    if (!ready) return false;
    const r = await saveTwoTruths(s, lie!, placeFirst);
    setStatus(r.error ? { error: r.error } : { saved: true });
    return !r.error;
  }

  useEffect(() => {
    onReady?.(ready, save);
    if (!autoSave || !ready) return;
    const timer = setTimeout(() => void save(), 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, lie, ready]);

  return (
    <div className="space-y-3">
      {initial && changed && (
        <p className="rounded-xl bg-brand-soft px-3 py-2 text-xs">Changing these resets everyone&apos;s guesses.</p>
      )}
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <label htmlFor={`truth-${i}`} className="text-sm font-semibold text-muted">{TWO_TRUTHS_HELP[i]}</label>
          <input
            id={`truth-${i}`}
            ref={i === 0 ? first : undefined}
            value={s[i]}
            maxLength={TWO_TRUTHS_MAX}
            onChange={(e) => setS((cur) => cur.map((t, j) => (j === i ? e.target.value : t)) as [string, string, string])}
            placeholder={examples[i] ?? ""}
            className="input mt-1"
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <label className={`inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold ${lie === i + 1 ? "text-danger" : "text-muted"}`}>
              <input type="radio" name="lie" checked={lie === i + 1} onChange={() => setLie(i + 1)} className="accent-[var(--danger)]" />
              This one&apos;s the lie
            </label>
            <span className="text-xs text-muted">{s[i].length}/{TWO_TRUTHS_MAX}</span>
          </div>
        </div>
      ))}
      {!autoSave && (
        <div className="flex justify-end gap-2">
          {onCancel && <button type="button" onClick={onCancel} className="btn-ghost py-2">Cancel</button>}
          <button
            type="button"
            disabled={!ready || pending}
            onClick={() =>
              start(async () => {
                if (await save()) onSaved?.();
              })
            }
            className="btn py-2"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      )}
      {!ready && <p className="text-xs text-muted">Fill in all three and tick which one is the lie.</p>}
      {autoSave && status.saved && ready && <p className="text-xs text-muted">Saved ✓</p>}
      {status.error && <p className="text-sm font-medium text-danger">{status.error}</p>}
    </div>
  );
}
