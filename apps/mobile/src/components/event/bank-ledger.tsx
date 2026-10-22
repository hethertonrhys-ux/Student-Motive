import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { bankSummary, formatPounds, parsePoundsSum, payoutOf, saveBankLedger, splitDifference, type BankEditorRow, type BankRow, type EventTable, type LedgerRowRecord, type MotiveEvent, type Person } from "@function/shared";
import { Icon } from "@/components/icon";
import { Button, Card, Input, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";

let counter = 0;
const newKey = () => `new-${++counter}`;

// The bank's screen: record buy-ins and rebuys as they happen, then each
// player's cash-out and whether it's been paid. canAddPlayers: off on the
// committee's manage page, where players are added at the top instead.
export function BankLedger({ event, table, initialRows, onSaved, canAddPlayers = true }: { event: MotiveEvent; table: EventTable; initialRows: BankEditorRow[]; onSaved: () => Promise<unknown>; canAddPlayers?: boolean }) {
  const [rows, setRows] = useState<BankEditorRow[]>(initialRows);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<{ error?: string; saved?: boolean }>({});
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
  const effectiveDifference = summary.differencePence === null ? null : summary.differencePence + rows.filter((r) => r.name.trim()).reduce((s, r) => s + r.adjust, 0);

  function applySplit() {
    if (summary.differencePence === null) return;
    const named = rows.filter((r) => r.name.trim());
    const shares = splitDifference(named.length, summary.differencePence);
    const byKey = new Map(named.map((r, i) => [r.key, shares[i]]));
    setRows((cur) => cur.map((r) => ({ ...r, adjust: byKey.get(r.key) ?? 0 })));
  }
  const snapshot = (list: BankEditorRow[]) => JSON.stringify(list.filter((r) => r.name.trim()).map(({ id, name, buyins, cashout, paidOut, adjust }) => ({ id, name, buyins, cashout, paidOut, adjust })));
  const dirty = snapshot(rows) !== snapshot(initialRows);

  async function save() {
    setSaving(true);
    const r = await saveBankLedger(supabase, event.id, table.id, rows);
    if (!r.error) await onSaved();
    setState(r.error ? { error: r.error } : { saved: true });
    setSaving(false);
  }

  return (
    <Card className="gap-4" testID="bank-ledger">
      <View>
        <T variant="display-bold" className="text-lg">{table.name}{table.level ? ` · ${table.level}` : ""}</T>
        <Muted className="text-sm">You are the bank. Buy-ins go to the bank; the bank pays each player their cash-out.</Muted>
      </View>

      <View className="flex-row flex-wrap gap-2">
        <Stat label="Taken in" value={formatPounds(summary.takenIn)} />
        <Stat label="Paid out" value={formatPounds(summary.paidOut)} />
        <Stat label="Still to pay" value={formatPounds(summary.owed)} />
        <Stat label="In the bank" value={formatPounds(summary.inBank)} strong />
      </View>

      <View className="gap-3">
        {rows.map((r) => {
          const row = parsed.bankRows.find((b) => b.id === r.key);
          const payout = row ? payoutOf(row) : null;
          const net = row && row.cashoutPence !== null ? row.cashoutPence + row.adjustPence - row.buyinPence : null;
          const firstBuyin = r.buyins.split("+")[0]?.trim();
          return (
            <View key={r.key} className="rounded-xl border border-line p-3" testID={`bank-row-${r.userId ?? r.key}`}>
              <View className="flex-row items-center gap-2">
                <View className="min-w-0 flex-1">
                  <Input value={r.name} onChangeText={(v) => update(r.key, { name: v })} editable={!r.userId} placeholder="Player name" maxLength={60} className={`py-2 font-sans-semibold ${r.userId ? "bg-bg" : ""}`} accessibilityLabel="Player name" />
                </View>
                {net !== null && <T variant="display-bold" className={net > 0 ? "text-ok" : net < 0 ? "text-danger" : ""}>{formatPounds(net, true)}</T>}
                <Pressable onPress={() => setRows((cur) => cur.filter((x) => x.key !== r.key))} accessibilityLabel={`Remove ${r.name || "player"}`} className="px-1">
                  <Icon name="close" size={18} color="#5e5d78" />
                </Pressable>
              </View>
              <View className="mt-2 flex-row gap-2">
                <View className="flex-1">
                  <Muted className="text-xs font-sans-semibold">Buy-ins (£)</Muted>
                  <View className="mt-1 flex-row gap-1">
                    <View className="min-w-0 flex-1">
                      <Input value={r.buyins} onChangeText={(v) => update(r.key, { buyins: v })} keyboardType="default" placeholder="10" className="py-2 font-sans-semibold" accessibilityLabel={`${r.name || "Player"} buy-ins`} testID="buyins" />
                    </View>
                    {!!firstBuyin && (
                      <Pressable onPress={() => update(r.key, { buyins: `${r.buyins}+${firstBuyin}` })} className="justify-center rounded-lg border border-line px-2" accessibilityLabel="Add a rebuy" testID="rebuy">
                        <T variant="bold" className="text-xs text-brand">+{firstBuyin}</T>
                      </Pressable>
                    )}
                  </View>
                </View>
                <View className="flex-1">
                  <Muted className="text-xs font-sans-semibold">Cash-out (£)</Muted>
                  <Input value={r.cashout} onChangeText={(v) => update(r.key, { cashout: v, paidOut: v.trim() ? r.paidOut : false })} keyboardType="decimal-pad" placeholder="Still playing" className="mt-1 py-2 font-sans-semibold" accessibilityLabel={`${r.name || "Player"} cash-out`} testID="cashout" />
                </View>
              </View>
              {payout !== null && (
                <Pressable onPress={() => update(r.key, { paidOut: !r.paidOut })} className="mt-2 flex-row items-center justify-between gap-2 rounded-lg bg-bg px-3 py-2" testID="paid-toggle">
                  <T className="flex-1 text-sm">
                    {payout >= 0 ? <>Bank pays <T variant="bold" className="text-sm">{formatPounds(payout)}</T></> : <>Owes the bank <T variant="bold" className="text-sm">{formatPounds(-payout)}</T></>}
                    {r.adjust !== 0 && <Muted className="text-xs"> (incl. split {formatPounds(r.adjust, true)})</Muted>}
                  </T>
                  <View className="flex-row items-center gap-2">
                    <View className={`h-5 w-5 items-center justify-center rounded-md border ${r.paidOut ? "border-ok bg-ok" : "border-line bg-surface"}`}>{r.paidOut && <Icon name="checkmark" size={14} color="#fff" />}</View>
                    <T variant="semibold" className="text-sm">{r.paidOut ? "Paid ✓" : "Paid?"}</T>
                  </View>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      {canAddPlayers && (
        <Pressable onPress={() => setRows((cur) => [...cur, { key: newKey(), name: "", buyins: "", cashout: "", paidOut: false, adjust: 0 }])} testID="add-player">
          <T variant="semibold" className="text-sm text-brand">+ Add a player not on Function</T>
        </Pressable>
      )}

      {parsed.invalid.length > 0 && <T variant="semibold" className="text-sm text-danger">Check the amounts for {parsed.invalid.join(", ")}.</T>}

      {summary.stillPlaying > 0 ? (
        <Muted className="text-sm">{summary.stillPlaying} still playing. Add their cash-out when they finish.</Muted>
      ) : effectiveDifference !== null && effectiveDifference !== 0 ? (
        <View className="gap-2 rounded-xl bg-danger/10 px-3 py-3">
          <T variant="semibold" className="text-sm text-danger">
            The chips don&apos;t match the money: cash-outs are {formatPounds(Math.abs(effectiveDifference))} {effectiveDifference > 0 ? "more" : "less"} than the buy-ins. Recount, or share the difference evenly.
          </T>
          <Button onPress={applySplit} className="self-start py-2" testID="split">Split it between {rows.filter((r) => r.name.trim()).length} players</Button>
        </View>
      ) : summary.differencePence !== null ? (
        <T variant="semibold" className="rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok" testID="adds-up">
          ✓ Everyone&apos;s cashed out and it adds up.{summary.owed !== 0 ? ` ${formatPounds(summary.owed)} still to hand over.` : " All paid."}
        </T>
      ) : null}
      {hasSplit && (
        <Muted className="text-sm">
          Includes an even split to make the table add up.{" "}
          <T variant="semibold" className="text-sm text-brand" onPress={() => setRows((cur) => cur.map((r) => ({ ...r, adjust: 0 })))}>Undo split</T>
        </Muted>
      )}

      <View className="flex-row flex-wrap items-center gap-3">
        <Button onPress={() => void save()} disabled={saving} testID="save-bank">{saving ? "Saving…" : "Save"}</Button>
        {dirty && !saving && <Muted className="text-sm">Unsaved changes</Muted>}
        {!dirty && !saving && rows.some((r) => r.id) && rows.filter((r) => r.name.trim()).every((r) => r.id) && <T variant="semibold" className="text-sm text-ok">All saved ✓</T>}
        {state.error && <T variant="semibold" className="text-sm text-danger">{state.error}</T>}
      </View>
    </Card>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className={`min-w-[45%] flex-1 items-center rounded-xl px-2 py-2 ${strong ? "bg-brand-soft" : "bg-bg"}`}>
      <Muted className="text-xs font-sans-semibold">{label}</Muted>
      <T variant="display-bold" className={`text-lg ${strong ? "text-brand" : ""}`}>{value}</T>
    </View>
  );
}

// Playing at a table with a bank (and not the bank): buy in and cash out with them.
export function MyBankLine({ table, mine, people }: { table: EventTable; mine: LedgerRowRecord | null; people: Person[] }) {
  const bankName = people.find((p) => p.userId === table.bank_user_id)?.name ?? "The bank";
  return (
    <Card className="gap-2" testID="my-bank-line">
      <T variant="semibold">{bankName} is the bank for {table.name}</T>
      <Muted className="text-sm">Buy in and cash out with them. They&apos;ll record it here.</Muted>
      {mine && (
        <View className="flex-row gap-2">
          <Stat label="Bought in" value={formatPounds(mine.buyin_pence)} />
          <Stat label="Cash-out" value={mine.cashout_pence === null ? "Playing" : formatPounds(mine.cashout_pence + mine.adjust_pence)} />
          <Stat label="Paid" value={mine.paid_out ? "✓" : "–"} />
        </View>
      )}
    </Card>
  );
}
