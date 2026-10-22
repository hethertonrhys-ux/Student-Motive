import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { addPayment, deletePayment, formatPounds, parsePounds, saveLedger, settle, splitDifference, type EditorRow, type LedgerPaymentRecord } from "@function/shared";
import { LinkButton } from "@/components/event/panels";
import { Icon } from "@/components/icon";
import { Select } from "@/components/select";
import { Button, Card, Input, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";

const pence = (amount: string) => (amount.trim() === "" ? 0 : parsePounds(amount));

type SavedPayment = LedgerPaymentRecord & { addedBy: string | null };

// Results (how much each player is up or down), who pays who, and settling up.
export function LedgerEditor({ eventId, tableId, title, initialRows, payments, onSaved }: { eventId: string; tableId: string | null; title: string; initialRows: EditorRow[]; payments: SavedPayment[]; onSaved: () => Promise<unknown> }) {
  const [rows, setRows] = useState<EditorRow[]>(initialRows);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

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
  const snapshot = (list: EditorRow[]) => JSON.stringify(list.filter((r) => r.name.trim() || r.amount.trim()).map(({ id, name, amount, adjust }) => ({ id, name, amount, adjust })));
  const dirty = snapshot(rows) !== snapshot(initialRows);
  const hasSplit = rows.some((r) => r.adjust !== 0);

  async function save() {
    setSaving(true);
    setSaveError(null);
    const r = await saveLedger(supabase, eventId, tableId, rows);
    if (r.error) setSaveError(r.error);
    else await onSaved();
    setSaving(false);
  }
  async function pay(fromRow: string, toRow: string, amountText: string) {
    setPayError(null);
    const r = await addPayment(supabase, eventId, fromRow, toRow, amountText);
    if (r.error) setPayError(r.error);
    else {
      setAmount("");
      await onSaved();
    }
  }

  return (
    <Card className="gap-5" testID={`ledger-${tableId ?? "event"}`}>
      <T variant="display-bold" className="text-lg">{title}</T>

      <View className="gap-3">
        <T variant="semibold">Results</T>
        <Muted className="text-sm">How much each player is up or down, in pounds. Use a minus for losses, e.g. -15.</Muted>
        {rows.length === 0 && <Muted className="text-sm" testID="ledger-empty">Nobody here yet. Add players at the top of the page.</Muted>}
        <View className="gap-2">
          {rows.map((r) => {
            const value = pence(r.amount);
            return (
              <View key={r.key} testID={`ledger-row-${r.userId ?? r.key}`}>
                {/* Name on the left (the wide box), amount on the right. Each box sits
                    in its own View: the shared Input is full width, which on a phone
                    squeezed the name box and pushed the amount box off the card. */}
                <View className="flex-row items-center gap-2">
                  <View className="min-w-0 flex-1">
                    <Input value={r.name} onChangeText={(v) => update(r.key, { name: v })} placeholder="Player name" maxLength={60} editable={!r.userId} className={r.userId ? "bg-bg" : ""} accessibilityLabel="Player name" testID="ledger-name" />
                  </View>
                  <View className="w-24">
                    <Input value={r.amount} onChangeText={(v) => update(r.key, { amount: v })} keyboardType="numbers-and-punctuation" placeholder="£0" className={`font-sans-semibold ${value === null ? "border-danger" : value > 0 ? "text-ok" : value < 0 ? "text-danger" : ""}`} accessibilityLabel={`${r.name || "Player"} result in pounds`} testID="ledger-amount" />
                  </View>
                  <Pressable onPress={() => setRows((cur) => cur.filter((x) => x.key !== r.key))} accessibilityLabel={`Remove ${r.name || "row"}`} className="px-1">
                    <Icon name="close" size={18} color="#5e5d78" />
                  </Pressable>
                </View>
                {(r.selfReported || r.adjust !== 0) && (
                  <View className="mt-0.5 flex-row gap-3 pl-1">
                    {r.selfReported && <T variant="semibold" className="text-xs text-brand">Entered by the player</T>}
                    {r.adjust !== 0 && <Muted className="text-xs">Split: {formatPounds(r.adjust, true)}</Muted>}
                  </View>
                )}
              </View>
            );
          })}
        </View>
        <View className="flex-row flex-wrap items-center gap-3">
          <Button onPress={() => void save()} disabled={saving} testID="save-results">{saving ? "Saving…" : "Save results"}</Button>
          {dirty && !saving && <Muted className="text-sm">Unsaved changes</Muted>}
          {!dirty && !saving && rows.some((r) => r.id) && rows.filter((r) => r.name.trim()).every((r) => r.id) && <T variant="semibold" className="text-sm text-ok">All saved ✓</T>}
          {saveError && <T variant="semibold" className="text-sm text-danger">{saveError}</T>}
        </View>
      </View>

      <View className="gap-2 border-t border-line pt-4">
        <T variant="semibold">Who pays who</T>
        {preview.kind === "invalid" ? (
          <T className="text-sm text-danger">Check the amount for {preview.invalid.join(", ")}.</T>
        ) : preview.settlement.imbalancePence !== 0 ? (
          <View className="gap-2 rounded-xl bg-danger/10 px-3 py-3">
            <T variant="semibold" className="text-sm text-danger">
              The results don&apos;t add up: they&apos;re {formatPounds(Math.abs(preview.settlement.imbalancePence))} {preview.settlement.imbalancePence > 0 ? "over" : "under"}. Check everyone&apos;s numbers, or share the difference evenly.
            </T>
            {preview.count > 0 && (
              <Button onPress={applySplit} className="self-start py-2" testID="ledger-split">
                Split it: {formatPounds(Math.ceil(Math.abs(preview.rawTotal) / preview.count))}{Math.abs(preview.rawTotal) % preview.count ? " or less" : ""} each {preview.rawTotal > 0 ? "extra to pay" : "back"} ({preview.count} players)
              </Button>
            )}
          </View>
        ) : preview.settlement.transfers.length === 0 ? (
          <Muted className="text-sm">Everyone&apos;s square.</Muted>
        ) : (
          <View className="gap-1.5">
            {preview.settlement.transfers.map((t, i) => (
              <View key={i} className="flex-row items-center gap-3 rounded-xl bg-brand-soft px-3 py-2" testID="ledger-transfer">
                {/* Names and amount wrap on the left, so the button never goes off the screen. */}
                <View className="min-w-0 flex-1">
                  <T><T variant="bold">{preview.names.get(t.fromId)}</T> pays <T variant="bold">{preview.names.get(t.toId)}</T></T>
                  <T variant="display-bold" className="text-lg">{formatPounds(t.amountPence)}</T>
                </View>
                {/* Saved players only: a mark is saved as a payment between them. */}
                {!dirty && nameById.has(t.fromId) && nameById.has(t.toId) && (
                  <Pressable onPress={() => void pay(t.fromId, t.toId, (t.amountPence / 100).toFixed(2))} className="min-h-11 shrink-0 justify-center rounded-lg bg-surface px-3" testID="mark-paid">
                    <T variant="bold" className="text-sm text-brand">Mark paid</T>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}
        {hasSplit && preview.kind === "ok" && (
          <Muted className="text-sm">
            Includes an even split of {formatPounds(Math.abs(preview.adjustTotal))} to make the table add up.{" "}
            <T variant="semibold" className="text-sm text-brand" onPress={() => setRows((cur) => cur.map((r) => ({ ...r, adjust: 0 })))}>Undo split</T>
          </Muted>
        )}
        {dirty && <Muted className="text-xs">Showing your unsaved numbers. Save so players see the same.</Muted>}
      </View>

      <View className="gap-3 border-t border-line pt-4">
        <T variant="semibold">Settle up</T>
        {preview.kind === "ok" && preview.settlement.imbalancePence === 0 && (
          <T variant="semibold" className={`text-sm ${preview.settlement.transfers.length ? "" : "text-ok"}`}>
            {preview.settlement.transfers.length ? `Still to pay: ${formatPounds(preview.settlement.transfers.reduce((sum, t) => sum + t.amountPence, 0))} in ${preview.settlement.transfers.length} payment${preview.settlement.transfers.length === 1 ? "" : "s"}.` : tablePayments.length ? "✓ All settled." : "Nothing to pay."}
          </T>
        )}
        <Muted className="text-sm">Payments marked paid (by you or the players), and any made another way, e.g. someone who left early. If results change, who pays who is worked out again.</Muted>
        {tablePayments.map((p) => (
          <View key={p.id} className="flex-row items-center justify-between gap-2 rounded-xl bg-bg px-3 py-2" testID="ledger-payment">
            <T className="min-w-0 flex-1 text-sm"><T variant="bold" className="text-sm">{nameById.get(p.from_row)}</T> paid <T variant="bold" className="text-sm">{nameById.get(p.to_row)}</T> {formatPounds(p.amount_pence)}{p.addedBy && <T variant="semibold" className="text-xs text-brand">  added by {p.addedBy}</T>}</T>
            <LinkButton onPress={() => void deletePayment(supabase, eventId, p.id).then(() => onSaved())} danger>Remove</LinkButton>
          </View>
        ))}
        {savedRows.length >= 2 ? (
          <View className="gap-2">
            <View className="flex-row flex-wrap items-center gap-2">
              <View className="min-w-[40%] flex-1"><Select value={from} onChange={setFrom} options={savedRows.map((r) => ({ value: r.id!, label: r.name }))} placeholder="Who paid" accessibilityLabel="Who paid" testID="pay-from" /></View>
              <Muted className="text-sm">paid</Muted>
              <View className="min-w-[40%] flex-1"><Select value={to} onChange={setTo} options={savedRows.map((r) => ({ value: r.id!, label: r.name }))} placeholder="Who" accessibilityLabel="Who they paid" testID="pay-to" /></View>
            </View>
            <View className="flex-row items-center gap-2">
              <View className="w-28">
                <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="£" accessibilityLabel="Amount paid" testID="pay-amount" />
              </View>
              <Button variant="ghost" onPress={() => void pay(from, to, amount)} testID="pay-add">Add</Button>
            </View>
            {payError && <T variant="semibold" className="text-sm text-danger">{payError}</T>}
          </View>
        ) : (
          <Muted className="text-sm">Save at least two players&apos; results first.</Muted>
        )}
      </View>
    </Card>
  );
}
