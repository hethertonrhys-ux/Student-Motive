import { useState } from "react";
import { Pressable, View } from "react-native";
import { deleteMyPayment, formatPounds, parsePounds, recordMyPayment, recordMyResult, type LedgerPaymentRecord, type LedgerRowRecord, type MotiveEvent, type Person } from "@function/shared";
import { Button, Card, Input, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { LinkButton } from "./panels";

// Lets a player enter their own result and settle-ups, e.g. when leaving early.
export function SelfReport({ event, me, people, rows, payments, onChange }: { event: MotiveEvent; me: Person; people: Person[]; rows: LedgerRowRecord[]; payments: LedgerPaymentRecord[]; onChange: () => Promise<unknown> }) {
  const myRow = rows.find((r) => r.user_id === me.userId) ?? null;
  const rowName = new Map(rows.map((r) => [r.id, r.player_name]));
  const tablemates = people.filter((p) => p.status === "going" && p.userId !== me.userId && p.tableId === me.tableId);
  const myPayments = myRow
    ? payments
        .filter((p) => p.from_row === myRow.id || p.to_row === myRow.id)
        .map((p) => {
          const iPaid = p.from_row === myRow.id;
          return { id: p.id, iPaid, otherName: rowName.get(iPaid ? p.to_row : p.from_row) ?? "another player", amountPence: p.amount_pence, mine: p.created_by === me.userId };
        })
    : [];
  const myNetPence = myRow ? myRow.net_pence : null;

  const [direction, setDirection] = useState<"up" | "down">(myNetPence !== null && myNetPence < 0 ? "down" : "up");
  const [amount, setAmount] = useState(myNetPence ? (Math.abs(myNetPence) / 100).toFixed(2).replace(/\.00$/, "") : "");
  const [resultState, setResultState] = useState<{ error?: string; saved?: boolean }>({});
  const [savingResult, setSavingResult] = useState(false);
  const [payDirection, setPayDirection] = useState<"paid" | "received">(direction === "down" ? "paid" : "received");
  const [other, setOther] = useState<string>("");
  const [payAmount, setPayAmount] = useState("");
  const [payState, setPayState] = useState<{ error?: string }>({});
  const [savingPayment, setSavingPayment] = useState(false);

  async function saveResult() {
    const pence = parsePounds(amount);
    if (pence === null) return setResultState({ error: "Enter an amount, e.g. 12.50." });
    setSavingResult(true);
    const r = await recordMyResult(supabase, event.id, Math.abs(pence) * (direction === "down" ? -1 : 1));
    if (!r.error) await onChange();
    setResultState(r.error ? { error: r.error } : { saved: true });
    setSavingResult(false);
  }
  async function savePayment() {
    const pence = parsePounds(payAmount);
    if (!other) return setPayState({ error: "Choose the player." });
    if (pence === null || pence <= 0) return setPayState({ error: "Enter an amount, e.g. 12.50." });
    setSavingPayment(true);
    const r = await recordMyPayment(supabase, event.id, other, pence, payDirection === "paid");
    if (!r.error) {
      setPayAmount("");
      await onChange();
    }
    setPayState(r.error ? { error: r.error } : {});
    setSavingPayment(false);
  }

  return (
    <Card className="gap-5" testID="self-report">
      <View>
        <T variant="display" className="text-xl">Leaving early?</T>
        <Muted className="text-sm">Enter how you did and anyone you&apos;ve already settled with. The committee includes it when they work out who pays who at the end.</Muted>
      </View>

      <View className="gap-2">
        <T variant="semibold">
          Your result
          {myNetPence !== null && myNetPence !== 0 && <T variant="semibold" className={myNetPence > 0 ? "text-ok" : "text-danger"}>  saved: {formatPounds(myNetPence, true)}</T>}
        </T>
        <View className="flex-row flex-wrap items-center gap-2">
          <Segment value={direction} onChange={(v) => setDirection(v as "up" | "down")} options={[["up", "I'm up"], ["down", "I'm down"]]} />
          <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="£" className="w-28 text-right font-sans-semibold" accessibilityLabel="Amount in pounds" testID="result-amount" />
          <Button onPress={() => void saveResult()} disabled={savingResult} testID="save-result">{savingResult ? "Saving…" : "Save"}</Button>
        </View>
        {resultState.error && <T variant="semibold" className="text-sm text-danger">{resultState.error}</T>}
        {resultState.saved && !savingResult && <T variant="semibold" className="text-sm text-ok">Saved.</T>}
      </View>

      <View className="gap-2 border-t border-line pt-4">
        <T variant="semibold">Already settled with someone?</T>
        {myPayments.length > 0 && (
          <View className="gap-1.5">
            {myPayments.map((p) => (
              <View key={p.id} className="flex-row items-center justify-between rounded-xl bg-bg px-3 py-2">
                <T className="text-sm">
                  {p.iPaid ? <>You paid <T variant="bold" className="text-sm">{p.otherName}</T></> : <><T variant="bold" className="text-sm">{p.otherName}</T> paid you</>} {formatPounds(p.amountPence)}
                </T>
                {p.mine && (
                  <LinkButton
                    onPress={() =>
                      void deleteMyPayment(supabase, p.id).then(() => onChange())
                    }
                  >
                    Remove
                  </LinkButton>
                )}
              </View>
            ))}
          </View>
        )}
        {tablemates.length === 0 ? (
          <Muted className="text-sm">Nobody else is at your table on Function yet.</Muted>
        ) : (
          <View className="gap-2">
            <Segment value={payDirection} onChange={(v) => setPayDirection(v as "paid" | "received")} options={[["paid", "I paid"], ["received", "I was paid by"]]} />
            <View className="flex-row flex-wrap gap-2">
              {tablemates.map((t) => (
                <Pressable key={t.userId} onPress={() => setOther(t.userId)} accessibilityState={{ selected: other === t.userId }} testID={`player-${t.userId}`} className={`rounded-full border px-3 py-1.5 ${other === t.userId ? "border-brand bg-brand" : "border-line bg-surface"}`}>
                  <T variant="semibold" className={`text-sm ${other === t.userId ? "text-brand-ink" : ""}`}>{t.name}</T>
                </Pressable>
              ))}
            </View>
            <View className="flex-row items-center gap-2">
              <Input value={payAmount} onChangeText={setPayAmount} keyboardType="decimal-pad" placeholder="£" className="w-24 text-right" accessibilityLabel="Amount paid" testID="pay-amount" />
              <Button variant="ghost" onPress={() => void savePayment()} disabled={savingPayment} testID="add-payment">Add</Button>
            </View>
            {payState.error && <T variant="semibold" className="text-sm text-danger">{payState.error}</T>}
          </View>
        )}
      </View>
    </Card>
  );
}

export function Segment({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <View className="flex-row self-start rounded-xl border border-line bg-surface p-1">
      {options.map(([v, label]) => (
        <Pressable key={v} onPress={() => onChange(v)} accessibilityState={{ selected: value === v }} testID={`seg-${v}`} className={`rounded-lg px-3 py-1.5 ${value === v ? "bg-brand" : ""}`}>
          <T variant="semibold" className={`text-sm ${value === v ? "text-brand-ink" : "text-muted"}`}>{label}</T>
        </Pressable>
      ))}
    </View>
  );
}
