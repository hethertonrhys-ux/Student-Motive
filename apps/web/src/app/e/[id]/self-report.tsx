"use client";

import { useActionState, useState } from "react";
import { formatPounds } from "@/lib/ledger";
import type { ReportState } from "./actions";
import { ActionButton } from "./action-button";
import type { JoinResult } from "./actions";

type Payment = { id: string; iPaid: boolean; otherName: string; amountPence: number; mine: boolean };

type Props = {
  myNetPence: number | null;
  tablemates: { userId: string; name: string }[];
  payments: Payment[];
  resultAction: (s: ReportState, f: FormData) => Promise<ReportState>;
  paymentAction: (s: ReportState, f: FormData) => Promise<ReportState>;
  deletePaymentAction: (paymentId: string) => Promise<JoinResult>;
};

// Lets a player enter their own result and settle-ups, e.g. when leaving early.
export function SelfReport({ myNetPence, tablemates, payments, resultAction, paymentAction, deletePaymentAction }: Props) {
  const [resultState, saveResult, savingResult] = useActionState(resultAction, {});
  const [payState, savePayment, savingPayment] = useActionState(paymentAction, {});
  const [direction, setDirection] = useState<"up" | "down">(myNetPence !== null && myNetPence < 0 ? "down" : "up");
  const [payDirection, setPayDirection] = useState<"paid" | "received">(direction === "down" ? "paid" : "received");

  return (
    <div className="card space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold">Leaving early?</h2>
        <p className="text-sm text-muted">
          Enter how you did and anyone you&apos;ve already settled with. The committee includes it when they work out who
          pays who at the end.
        </p>
      </div>

      <form action={saveResult} className="space-y-2">
        <p className="font-semibold">
          Your result
          {myNetPence !== null && myNetPence !== 0 && (
            <span className={`ml-2 ${myNetPence > 0 ? "text-ok" : "text-danger"}`}>saved: {formatPounds(myNetPence, true)}</span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Segment name="direction" value={direction} onChange={(v) => setDirection(v as "up" | "down")} options={[["up", "I'm up"], ["down", "I'm down"]]} />
          <input
            name="amount"
            inputMode="decimal"
            required
            placeholder="£"
            defaultValue={myNetPence ? (Math.abs(myNetPence) / 100).toFixed(2).replace(/\.00$/, "") : ""}
            className="input w-28 text-right font-semibold"
            aria-label="Amount in pounds"
          />
          <button className="btn" disabled={savingResult}>{savingResult ? "Saving…" : "Save"}</button>
        </div>
        {resultState.error && <p className="text-sm font-medium text-danger">{resultState.error}</p>}
        {resultState.saved && !savingResult && <p className="text-sm font-medium text-ok">Saved.</p>}
      </form>

      <div className="space-y-2 border-t border-line pt-4">
        <p className="font-semibold">Already settled with someone?</p>
        {payments.length > 0 && (
          <ul className="space-y-1.5">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-xl bg-bg px-3 py-2 text-sm">
                <span>
                  {p.iPaid ? <>You paid <strong>{p.otherName}</strong></> : <><strong>{p.otherName}</strong> paid you</>} {formatPounds(p.amountPence)}
                </span>
                {p.mine && <ActionButton action={() => deletePaymentAction(p.id)} variant="link">Remove</ActionButton>}
              </li>
            ))}
          </ul>
        )}
        {tablemates.length === 0 ? (
          <p className="text-sm text-muted">Nobody else is at your table on Function yet.</p>
        ) : (
          <form action={savePayment} className="flex flex-wrap items-center gap-2">
            <Segment name="direction" value={payDirection} onChange={(v) => setPayDirection(v as "paid" | "received")} options={[["paid", "I paid"], ["received", "I was paid by"]]} />
            <select name="other_user" required defaultValue="" className="input w-auto flex-1" aria-label="Player">
              <option value="" disabled>Choose a player</option>
              {tablemates.map((t) => <option key={t.userId} value={t.userId}>{t.name}</option>)}
            </select>
            <input name="amount" inputMode="decimal" required placeholder="£" className="input w-24 text-right" aria-label="Amount paid" />
            <button className="btn-ghost" disabled={savingPayment}>Add</button>
            {payState.error && <p className="w-full text-sm font-medium text-danger">{payState.error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}

function Segment({ name, value, onChange, options }: { name: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <span className="inline-flex rounded-xl border border-line bg-surface p-1">
      <input type="hidden" name={name} value={value} />
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${value === v ? "bg-brand text-brand-ink" : "text-muted"}`}
        >
          {label}
        </button>
      ))}
    </span>
  );
}
