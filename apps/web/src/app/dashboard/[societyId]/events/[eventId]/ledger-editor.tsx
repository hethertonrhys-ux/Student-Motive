"use client";

import { useActionState, useMemo, useState } from "react";
import { formatPounds, parsePounds, settle, splitDifference } from "@/lib/ledger";
import type { LedgerState } from "./actions";

export type EditorRow = {
  key: string;
  id?: string;
  userId?: string | null;
  name: string;
  amount: string;
  adjust: number; // pence: this player's share of a counting difference
  selfReported?: boolean; // the player entered it themselves
};
type SavedPayment = { id: string; from_row: string; to_row: string; amount_pence: number; addedBy: string | null };

type Props = {
  title: string;
  initialRows: EditorRow[];
  payments: SavedPayment[];
  saveAction: (state: LedgerState, formData: FormData) => Promise<LedgerState>;
  addPaymentAction: (state: LedgerState, formData: FormData) => Promise<LedgerState>;
  deletePaymentAction: (paymentId: string) => Promise<void>;
};

let counter = 0;
const newKey = () => `new-${++counter}`;
const pence = (amount: string) => (amount.trim() === "" ? 0 : parsePounds(amount));

export function LedgerEditor({ title, initialRows, payments, saveAction, addPaymentAction, deletePaymentAction }: Props) {
  const [rows, setRows] = useState<EditorRow[]>(initialRows.length ? initialRows : [{ key: newKey(), name: "", amount: "", adjust: 0 }]);
  const [saveState, save, saving] = useActionState(saveAction, {});
  const [payState, addPayment, paying] = useActionState(addPaymentAction, {});

  const savedRows = initialRows.filter((r) => r.id);
  const nameById = new Map(savedRows.map((r) => [r.id!, r.name]));
  const tablePayments = payments.filter((p) => nameById.has(p.from_row) && nameById.has(p.to_row));

  // Work out "who pays who" live from what's typed, using payments already saved.
  const preview = useMemo(() => {
    const named = rows.filter((r) => r.name.trim());
    const invalid = named.filter((r) => pence(r.amount) === null).map((r) => r.name);
    if (invalid.length) return { kind: "invalid" as const, invalid };
    const rawTotal = named.reduce((sum, r) => sum + (pence(r.amount) ?? 0), 0);
    const adjustTotal = named.reduce((sum, r) => sum + r.adjust, 0);
    const settlement = settle(
      named.map((r) => ({ id: r.id ?? r.key, name: r.name.trim(), netPence: (pence(r.amount) ?? 0) + r.adjust })),
      tablePayments.map((p) => ({ fromId: p.from_row, toId: p.to_row, amountPence: p.amount_pence })),
    );
    return { kind: "ok" as const, settlement, rawTotal, adjustTotal, count: named.length, names: new Map(named.map((r) => [r.id ?? r.key, r.name.trim()])) };
  }, [rows, tablePayments]);

  const update = (key: string, change: Partial<EditorRow>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...change } : r)));

  function applySplit() {
    if (preview.kind === "invalid") return;
    const named = rows.filter((r) => r.name.trim());
    const shares = splitDifference(named.length, preview.rawTotal);
    const byKey = new Map(named.map((r, i) => [r.key, shares[i]]));
    setRows((cur) => cur.map((r) => ({ ...r, adjust: byKey.get(r.key) ?? 0 })));
  }
  const clearSplit = () => setRows((cur) => cur.map((r) => ({ ...r, adjust: 0 })));

  // Ignore blank rows when deciding if anything has changed.
  const snapshot = (list: EditorRow[]) =>
    JSON.stringify(list.filter((r) => r.name.trim() || r.amount.trim()).map(({ id, name, amount, adjust }) => ({ id, name, amount, adjust })));
  const dirty = snapshot(rows) !== snapshot(initialRows);
  const hasSplit = rows.some((r) => r.adjust !== 0);

  return (
    <div className="card space-y-5">
      <h3 className="font-display text-lg font-bold">{title}</h3>

      {/* 1. Results */}
      <form action={save} className="space-y-3">
        <h4 className="font-semibold">Results</h4>
        <p className="text-sm text-muted">How much each player is up or down, in pounds. Use a minus for losses, e.g. -15.</p>
        <ul className="space-y-2">
          {rows.map((r) => {
            const value = pence(r.amount);
            return (
              <li key={r.key}>
                <div className="flex items-center gap-2">
                  <input
                    value={r.name}
                    onChange={(e) => update(r.key, { name: e.target.value })}
                    placeholder="Player name"
                    maxLength={60}
                    readOnly={Boolean(r.userId)}
                    className={`input flex-1 ${r.userId ? "bg-bg" : ""}`}
                    aria-label="Player name"
                  />
                  <input
                    value={r.amount}
                    onChange={(e) => update(r.key, { amount: e.target.value })}
                    inputMode="decimal"
                    placeholder="0"
                    className={`input w-28 text-right font-semibold ${
                      value === null ? "border-danger" : value > 0 ? "text-ok" : value < 0 ? "text-danger" : ""
                    }`}
                    aria-label={`${r.name || "Player"} result in pounds`}
                  />
                  <button
                    type="button"
                    onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))}
                    className="px-1 text-sm font-semibold text-muted hover:text-danger"
                    aria-label={`Remove ${r.name || "row"}`}
                  >
                    ✕
                  </button>
                </div>
                {(r.selfReported || r.adjust !== 0) && (
                  <p className="mt-0.5 flex gap-3 pl-1 text-xs text-muted">
                    {r.selfReported && <span className="font-semibold text-brand">Entered by the player</span>}
                    {r.adjust !== 0 && <span>Split: {formatPounds(r.adjust, true)}</span>}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={() => setRows((cur) => [...cur, { key: newKey(), name: "", amount: "", adjust: 0 }])} className="text-sm font-semibold text-brand">
          + Add a player not on Function
        </button>
        <input
          type="hidden"
          name="rows_json"
          value={JSON.stringify(rows.map(({ id, userId, name, amount, adjust }) => ({ id, userId, name, amount, adjust })))}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn" disabled={saving}>{saving ? "Saving…" : "Save results"}</button>
          {dirty && !saving && <span className="text-sm font-medium text-muted">Unsaved changes</span>}
          {!dirty && !saving && rows.some((r) => r.id) && rows.filter((r) => r.name.trim()).every((r) => r.id) && (
            <span className="text-sm font-medium text-ok">All saved ✓</span>
          )}
          {saveState.error && <span className="text-sm font-medium text-danger">{saveState.error}</span>}
        </div>
      </form>

      {/* 2. Who pays who */}
      <div className="space-y-2 border-t border-line pt-4">
        <h4 className="font-semibold">Who pays who</h4>
        {preview.kind === "invalid" ? (
          <p className="text-sm text-danger">Check the amount for {preview.invalid.join(", ")}.</p>
        ) : preview.settlement.imbalancePence !== 0 ? (
          <div className="space-y-2 rounded-xl bg-danger/10 px-3 py-3 text-sm">
            <p className="font-medium text-danger">
              The results don&apos;t add up: they&apos;re {formatPounds(Math.abs(preview.settlement.imbalancePence))}{" "}
              {preview.settlement.imbalancePence > 0 ? "over" : "under"}.
              Check everyone&apos;s numbers, or share the difference evenly.
            </p>
            {preview.count > 0 && (
              <button type="button" onClick={applySplit} className="btn py-2">
                Split it: {formatPounds(Math.ceil(Math.abs(preview.rawTotal) / preview.count))}
                {Math.abs(preview.rawTotal) % preview.count ? " or less" : ""} each{" "}
                {preview.rawTotal > 0 ? "extra to pay" : "back"} ({preview.count} players)
              </button>
            )}
          </div>
        ) : preview.settlement.transfers.length === 0 ? (
          <p className="text-sm text-muted">Everyone&apos;s square.</p>
        ) : (
          <ul className="space-y-1.5">
            {preview.settlement.transfers.map((t, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-xl bg-brand-soft px-3 py-2">
                <span>
                  <strong>{preview.names.get(t.fromId)}</strong> pays <strong>{preview.names.get(t.toId)}</strong>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-display text-lg font-extrabold">{formatPounds(t.amountPence)}</span>
                  {/* Saved players only: a mark is saved as a payment between them. */}
                  {!dirty && nameById.has(t.fromId) && nameById.has(t.toId) && (
                    <form action={addPayment}>
                      <input type="hidden" name="from_row" value={t.fromId} />
                      <input type="hidden" name="to_row" value={t.toId} />
                      <input type="hidden" name="amount" value={(t.amountPence / 100).toFixed(2)} />
                      <button className="rounded-lg bg-surface px-2.5 py-1 text-sm font-bold text-brand" disabled={paying}>
                        Mark paid
                      </button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {hasSplit && preview.kind === "ok" && (
          <p className="text-sm text-muted">
            Includes an even split of {formatPounds(Math.abs(preview.adjustTotal))} to make the table add up.{" "}
            <button type="button" onClick={clearSplit} className="font-semibold text-brand">Undo split</button>
          </p>
        )}
        {dirty && <p className="text-xs text-muted">Showing your unsaved numbers. Save so players see the same.</p>}
      </div>

      {/* 3. Settle up: what's been paid, and what's still to pay */}
      <div className="space-y-3 border-t border-line pt-4">
        <h4 className="font-semibold">Settle up</h4>
        {preview.kind === "ok" && preview.settlement.imbalancePence === 0 && (
          <p className={`text-sm font-semibold ${preview.settlement.transfers.length ? "" : "text-ok"}`}>
            {preview.settlement.transfers.length
              ? `Still to pay: ${formatPounds(preview.settlement.transfers.reduce((sum, t) => sum + t.amountPence, 0))} in ${preview.settlement.transfers.length} payment${preview.settlement.transfers.length === 1 ? "" : "s"}.`
              : tablePayments.length
                ? "✓ All settled."
                : "Nothing to pay."}
          </p>
        )}
        <p className="text-sm text-muted">Payments marked paid (by you or the players), and any made another way, e.g. someone who left early. If results change, who pays who is worked out again.</p>
        {tablePayments.length > 0 && (
          <ul className="space-y-1.5">
            {tablePayments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-bg px-3 py-2 text-sm">
                <span>
                  <strong>{nameById.get(p.from_row)}</strong> paid <strong>{nameById.get(p.to_row)}</strong> {formatPounds(p.amount_pence)}
                  {p.addedBy && <span className="ml-2 text-xs font-semibold text-brand">added by {p.addedBy}</span>}
                </span>
                <form action={deletePaymentAction.bind(null, p.id)}>
                  <button className="font-semibold text-danger hover:underline">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {savedRows.length >= 2 ? (
          <form action={addPayment} className="flex flex-wrap items-end gap-2">
            <select name="from_row" required defaultValue="" className="input w-auto flex-1" aria-label="Who paid">
              <option value="" disabled>Who paid</option>
              {savedRows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <span className="pb-3 text-sm text-muted">paid</span>
            <select name="to_row" required defaultValue="" className="input w-auto flex-1" aria-label="Who they paid">
              <option value="" disabled>Who</option>
              {savedRows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <input name="amount" inputMode="decimal" placeholder="£" required className="input w-24" aria-label="Amount paid" />
            <button className="btn-ghost" disabled={paying}>Add</button>
            {payState.error && <p className="w-full text-sm font-medium text-danger">{payState.error}</p>}
          </form>
        ) : (
          <p className="text-sm text-muted">Save at least two players&apos; results first.</p>
        )}
      </div>

    </div>
  );
}
