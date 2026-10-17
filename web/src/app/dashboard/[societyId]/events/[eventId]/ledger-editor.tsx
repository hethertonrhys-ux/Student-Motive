"use client";

import { useActionState, useMemo, useState } from "react";
import { formatPounds, parsePounds, settle } from "@/lib/ledger";
import type { LedgerState } from "./actions";

type Row = { key: string; id?: string; userId?: string | null; name: string; amount: string };
type SavedPayment = { id: string; from_row: string; to_row: string; amount_pence: number };

type Props = {
  title: string;
  initialRows: Row[];
  payments: SavedPayment[];
  saveAction: (state: LedgerState, formData: FormData) => Promise<LedgerState>;
  addPaymentAction: (state: LedgerState, formData: FormData) => Promise<LedgerState>;
  deletePaymentAction: (paymentId: string) => Promise<void>;
};

let counter = 0;
const newKey = () => `new-${++counter}`;

export function LedgerEditor({ title, initialRows, payments, saveAction, addPaymentAction, deletePaymentAction }: Props) {
  const [rows, setRows] = useState<Row[]>(initialRows.length ? initialRows : [{ key: newKey(), name: "", amount: "" }]);
  const [saveState, save, saving] = useActionState(saveAction, {});
  const [payState, addPayment, paying] = useActionState(addPaymentAction, {});

  const savedRows = initialRows.filter((r) => r.id);
  const nameById = new Map(savedRows.map((r) => [r.id!, r.name]));
  const tablePayments = payments.filter((p) => nameById.has(p.from_row) && nameById.has(p.to_row));

  // Work out "who pays who" live from what's typed, using payments already saved.
  const preview = useMemo(() => {
    const parsed = rows
      .filter((r) => r.name.trim())
      .map((r) => ({ id: r.id ?? r.key, name: r.name.trim(), netPence: r.amount.trim() === "" ? 0 : parsePounds(r.amount) }));
    const invalid = parsed.filter((r) => r.netPence === null).map((r) => r.name);
    if (invalid.length) return { invalid };
    const valid = parsed as { id: string; name: string; netPence: number }[];
    const settlement = settle(
      valid,
      tablePayments.map((p) => ({ fromId: p.from_row, toId: p.to_row, amountPence: p.amount_pence })),
    );
    return { settlement, names: new Map(valid.map((r) => [r.id, r.name])) };
  }, [rows, tablePayments]);

  const update = (key: string, change: Partial<Row>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...change } : r)));
  // Ignore blank rows when deciding if anything has changed.
  const snapshot = (list: Row[]) =>
    JSON.stringify(list.filter((r) => r.name.trim() || r.amount.trim()).map(({ id, name, amount }) => ({ id, name, amount })));
  const dirty = snapshot(rows) !== snapshot(initialRows);

  return (
    <div className="card space-y-5">
      <h3 className="font-display text-lg font-bold">{title}</h3>

      {/* 1. Results */}
      <form action={save} className="space-y-3">
        <p className="text-sm text-muted">How much each player is up (+) or down (−), in pounds.</p>
        <ul className="space-y-2">
          {rows.map((r) => {
            const pence = r.amount.trim() === "" ? 0 : parsePounds(r.amount);
            return (
              <li key={r.key} className="flex items-center gap-2">
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
                    pence === null ? "border-danger" : pence > 0 ? "text-ok" : pence < 0 ? "text-danger" : ""
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
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={() => setRows((cur) => [...cur, { key: newKey(), name: "", amount: "" }])} className="text-sm font-semibold text-brand">
          + Add a player not on Motive
        </button>
        <input type="hidden" name="rows_json" value={JSON.stringify(rows.map(({ id, userId, name, amount }) => ({ id, userId, name, amount })))} />
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn" disabled={saving}>{saving ? "Saving…" : "Save results"}</button>
          {dirty && !saving && <span className="text-sm font-medium text-muted">Unsaved changes</span>}
          {saveState.saved && !dirty && !saving && <span className="text-sm font-medium text-ok">Saved.</span>}
          {saveState.error && <span className="text-sm font-medium text-danger">{saveState.error}</span>}
        </div>
      </form>

      {/* 2. Payments already made (e.g. someone left early) */}
      <div className="space-y-3 border-t border-line pt-4">
        <h4 className="font-semibold">Payments already made</h4>
        <p className="text-sm text-muted">If someone left early and paid another player, add it here so nobody pays twice.</p>
        {tablePayments.length > 0 && (
          <ul className="space-y-1.5">
            {tablePayments.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-xl bg-bg px-3 py-2 text-sm">
                <span>
                  <strong>{nameById.get(p.from_row)}</strong> paid <strong>{nameById.get(p.to_row)}</strong> {formatPounds(p.amount_pence)}
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

      {/* 3. Who pays who */}
      <div className="space-y-2 border-t border-line pt-4">
        <h4 className="font-semibold">Who pays who</h4>
        {"invalid" in preview ? (
          <p className="text-sm text-danger">Check the amount for {preview.invalid!.join(", ")}.</p>
        ) : preview.settlement!.imbalancePence !== 0 ? (
          <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
            The results don&apos;t add up: they&apos;re {formatPounds(Math.abs(preview.settlement!.imbalancePence))}{" "}
            {preview.settlement!.imbalancePence > 0 ? "over" : "under"}. Winnings and losses should cancel out, so check
            everyone&apos;s numbers.
          </p>
        ) : preview.settlement!.transfers.length === 0 ? (
          <p className="text-sm text-muted">Everyone&apos;s square.</p>
        ) : (
          <ul className="space-y-1.5">
            {preview.settlement!.transfers.map((t, i) => (
              <li key={i} className="flex items-center justify-between rounded-xl bg-brand-soft px-3 py-2">
                <span>
                  <strong>{preview.names!.get(t.fromId)}</strong> pays <strong>{preview.names!.get(t.toId)}</strong>
                </span>
                <span className="font-display text-lg font-extrabold">{formatPounds(t.amountPence)}</span>
              </li>
            ))}
          </ul>
        )}
        {dirty && <p className="text-xs text-muted">Showing your unsaved numbers. Save so players see the same.</p>}
      </div>
    </div>
  );
}
