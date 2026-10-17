"use client";

import { useActionState, useMemo, useState } from "react";
import { bankSummary, formatPounds, parsePoundsSum, payoutOf, splitDifference, type BankRow } from "@/lib/ledger";
import type { BankState } from "./bank-actions";

export type BankEditorRow = {
  key: string;
  id?: string;
  userId?: string | null;
  name: string;
  buyins: string; // e.g. "10+10"
  cashout: string; // blank = still playing
  paidOut: boolean;
  adjust: number;
};

type Props = {
  title: string;
  bankName: string;
  initialRows: BankEditorRow[];
  saveAction: (state: BankState, formData: FormData) => Promise<BankState>;
};

let counter = 0;
const newKey = () => `new-${++counter}`;

// The bank's screen: record buy-ins and rebuys as they happen, then each
// player's cash-out and whether it's been paid.
export function BankLedger({ title, bankName, initialRows, saveAction }: Props) {
  const [rows, setRows] = useState<BankEditorRow[]>(initialRows);
  const [state, save, saving] = useActionState(saveAction, {});
  const update = (key: string, change: Partial<BankEditorRow>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...change } : r)));

  const parsed = useMemo(() => {
    const named = rows.filter((r) => r.name.trim());
    const bankRows: BankRow[] = [];
    const invalid: string[] = [];
    for (const r of named) {
      const buyin = parsePoundsSum(r.buyins);
      const cashout = r.cashout.trim() === "" ? null : parsePoundsSum(r.cashout);
      if (buyin === null || (r.cashout.trim() !== "" && cashout === null)) invalid.push(r.name);
      bankRows.push({ id: r.key, name: r.name, buyinPence: buyin ?? 0, cashoutPence: cashout, adjustPence: r.adjust, paidOut: r.paidOut });
    }
    return { bankRows, invalid, summary: bankSummary(bankRows) };
  }, [rows]);

  const { summary } = parsed;
  const hasSplit = rows.some((r) => r.adjust !== 0);
  const effectiveDifference =
    summary.differencePence === null ? null : summary.differencePence + rows.filter((r) => r.name.trim()).reduce((s, r) => s + r.adjust, 0);

  function applySplit() {
    if (summary.differencePence === null) return;
    const named = rows.filter((r) => r.name.trim());
    const shares = splitDifference(named.length, summary.differencePence);
    const byKey = new Map(named.map((r, i) => [r.key, shares[i]]));
    setRows((cur) => cur.map((r) => ({ ...r, adjust: byKey.get(r.key) ?? 0 })));
  }

  const snapshot = (list: BankEditorRow[]) =>
    JSON.stringify(list.filter((r) => r.name.trim()).map(({ id, name, buyins, cashout, paidOut, adjust }) => ({ id, name, buyins, cashout, paidOut, adjust })));
  const dirty = snapshot(rows) !== snapshot(initialRows);

  return (
    <form action={save} className="card space-y-4">
      <div>
        <h3 className="font-display text-lg font-bold">{title}</h3>
        <p className="text-sm text-muted">🏦 {bankName} is the bank. Buy-ins go to the bank; the bank pays each player their cash-out.</p>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        <Stat label="Taken in" value={formatPounds(summary.takenIn)} />
        <Stat label="Paid out" value={formatPounds(summary.paidOut)} />
        <Stat label="Still to pay" value={formatPounds(summary.owed)} />
        <Stat label="In the bank" value={formatPounds(summary.inBank)} strong />
      </dl>

      <ul className="space-y-3">
        {rows.map((r) => {
          const row = parsed.bankRows.find((b) => b.id === r.key);
          const payout = row ? payoutOf(row) : null;
          const net = row && row.cashoutPence !== null ? row.cashoutPence + row.adjustPence - row.buyinPence : null;
          const firstBuyin = r.buyins.split("+")[0]?.trim();
          return (
            <li key={r.key} className="rounded-xl border border-line p-3">
              <div className="flex items-center gap-2">
                <input
                  value={r.name}
                  onChange={(e) => update(r.key, { name: e.target.value })}
                  readOnly={Boolean(r.userId)}
                  placeholder="Player name"
                  maxLength={60}
                  className={`input flex-1 py-2 font-semibold ${r.userId ? "bg-bg" : ""}`}
                  aria-label="Player name"
                />
                {net !== null && (
                  <span className={`shrink-0 font-display font-extrabold ${net > 0 ? "text-ok" : net < 0 ? "text-danger" : ""}`}>
                    {formatPounds(net, true)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))}
                  className="px-1 text-sm font-semibold text-muted hover:text-danger"
                  aria-label={`Remove ${r.name || "player"}`}
                >
                  ✕
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-muted">
                  Buy-ins (£)
                  <span className="mt-1 flex gap-1">
                    <input
                      value={r.buyins}
                      onChange={(e) => update(r.key, { buyins: e.target.value })}
                      inputMode="decimal"
                      placeholder="10"
                      className="input py-2 text-right text-base font-semibold text-ink"
                      aria-label={`${r.name || "Player"} buy-ins`}
                    />
                    {firstBuyin && (
                      <button
                        type="button"
                        onClick={() => update(r.key, { buyins: `${r.buyins}+${firstBuyin}` })}
                        className="shrink-0 rounded-lg border border-line px-2 text-xs font-bold text-brand"
                        title="Add a rebuy"
                      >
                        +{firstBuyin}
                      </button>
                    )}
                  </span>
                </label>
                <label className="text-xs font-semibold text-muted">
                  Cash-out (£)
                  <input
                    value={r.cashout}
                    onChange={(e) => update(r.key, { cashout: e.target.value, paidOut: e.target.value.trim() ? r.paidOut : false })}
                    inputMode="decimal"
                    placeholder="Still playing"
                    className="input mt-1 py-2 text-right text-base font-semibold text-ink"
                    aria-label={`${r.name || "Player"} cash-out`}
                  />
                </label>
              </div>
              {payout !== null && (
                <label className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-bg px-3 py-2 text-sm">
                  <span>
                    {payout >= 0 ? <>Bank pays <strong>{formatPounds(payout)}</strong></> : <>Owes the bank <strong>{formatPounds(-payout)}</strong></>}
                    {r.adjust !== 0 && <span className="text-xs text-muted"> (incl. split {formatPounds(r.adjust, true)})</span>}
                  </span>
                  <span className="flex items-center gap-2 font-semibold">
                    <input type="checkbox" checked={r.paidOut} onChange={(e) => update(r.key, { paidOut: e.target.checked })} className="size-5 accent-[var(--ok)]" />
                    {r.paidOut ? "Paid ✓" : "Paid?"}
                  </span>
                </label>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => setRows((cur) => [...cur, { key: newKey(), name: "", buyins: "", cashout: "", paidOut: false, adjust: 0 }])}
        className="text-sm font-semibold text-brand"
      >
        + Add a player not on Function
      </button>

      {parsed.invalid.length > 0 && <p className="text-sm font-medium text-danger">Check the amounts for {parsed.invalid.join(", ")}.</p>}

      {summary.stillPlaying > 0 ? (
        <p className="text-sm text-muted">{summary.stillPlaying} still playing. Add their cash-out when they finish.</p>
      ) : effectiveDifference !== null && effectiveDifference !== 0 ? (
        <div className="space-y-2 rounded-xl bg-danger/10 px-3 py-3 text-sm">
          <p className="font-medium text-danger">
            The chips don&apos;t match the money: cash-outs are {formatPounds(Math.abs(effectiveDifference))}{" "}
            {effectiveDifference > 0 ? "more" : "less"} than the buy-ins. Recount, or share the difference evenly.
          </p>
          <button type="button" onClick={applySplit} className="btn py-2">
            Split it between {rows.filter((r) => r.name.trim()).length} players
          </button>
        </div>
      ) : summary.differencePence !== null ? (
        <p className="rounded-xl bg-ok/10 px-3 py-2 text-sm font-semibold text-ok">
          ✓ Everyone&apos;s cashed out and it adds up.{summary.owed !== 0 ? ` ${formatPounds(summary.owed)} still to hand over.` : " All paid."}
        </p>
      ) : null}
      {hasSplit && (
        <p className="text-sm text-muted">
          Includes an even split to make the table add up.{" "}
          <button type="button" onClick={() => setRows((cur) => cur.map((r) => ({ ...r, adjust: 0 })))} className="font-semibold text-brand">
            Undo split
          </button>
        </p>
      )}

      <input
        type="hidden"
        name="rows_json"
        value={JSON.stringify(rows.map(({ id, userId, name, buyins, cashout, paidOut, adjust }) => ({ id, userId, name, buyins, cashout, paidOut, adjust })))}
      />
      <div className="sticky bottom-3 flex flex-wrap items-center gap-3 rounded-xl bg-surface/90 py-1 backdrop-blur">
        <button className="btn" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        {dirty && !saving && <span className="text-sm font-medium text-muted">Unsaved changes</span>}
        {!dirty && !saving && rows.some((r) => r.id) && rows.filter((r) => r.name.trim()).every((r) => r.id) && (
          <span className="text-sm font-medium text-ok">All saved ✓</span>
        )}
        {state.error && <span className="text-sm font-medium text-danger">{state.error}</span>}
      </div>
    </form>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl px-2 py-2 ${strong ? "bg-brand-soft" : "bg-bg"}`}>
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className={`font-display text-lg font-extrabold ${strong ? "text-brand" : ""}`}>{value}</dd>
    </div>
  );
}
