import { useState } from "react";
import { Pressable, View } from "react-native";
import { formatPounds, markPaymentPaid, settle, undoPaymentMark, type EventTable, type LedgerPaymentRecord, type LedgerRowRecord } from "@function/shared";
import { Card, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { LinkButton } from "./panels";

// After the event: what you owe or are owed.
export function MyResults({ eventId, userId, tables, rows, payments, onChange }: { eventId: string; userId: string; tables: EventTable[]; rows: LedgerRowRecord[]; payments: LedgerPaymentRecord[]; onChange: () => Promise<unknown> }) {
  const myRows = rows.filter((r) => r.user_id === userId);
  if (myRows.length === 0) return null;
  return (
    <View className="gap-4" testID="my-results">
      {myRows.map((mine) => {
        const tableRows = rows.filter((r) => r.table_id === mine.table_id);
        const names = new Map(tableRows.map((r) => [r.id, r.player_name]));
        const s = settle(
          tableRows.map((r) => ({ id: r.id, name: r.player_name, netPence: r.net_pence + r.adjust_pence })),
          payments.filter((p) => names.has(p.from_row)).map((p) => ({ fromId: p.from_row, toId: p.to_row, amountPence: p.amount_pence })),
        );
        const myTransfers = s.transfers.filter((t) => t.fromId === mine.id || t.toId === mine.id);
        const myPayments = payments.filter((p) => p.from_row === mine.id || p.to_row === mine.id);
        const table = tables.find((t) => t.id === mine.table_id);
        if (table?.bank_user_id) {
          const payout = mine.cashout_pence === null ? null : mine.cashout_pence + mine.adjust_pence;
          const net = (payout ?? 0) - mine.buyin_pence;
          return (
            <Card key={mine.id} className="gap-2">
              <View className="flex-row items-baseline justify-between">
                <T variant="display" className="text-xl">Your result · {table.name}</T>
                <T variant="display-bold" className={`text-2xl ${net > 0 ? "text-ok" : net < 0 ? "text-danger" : ""}`}>{formatPounds(net, true)}</T>
              </View>
              <T className="text-sm">
                You bought in <T variant="bold" className="text-sm">{formatPounds(mine.buyin_pence)}</T>
                {payout !== null && <> and cashed out <T variant="bold" className="text-sm">{formatPounds(payout)}</T></>}.
              </T>
              {payout !== null && payout > 0 && <T variant="semibold" className="rounded-xl bg-brand-soft px-3 py-2">{mine.paid_out ? "✓ The bank has paid you " : "The bank pays you "}{formatPounds(payout)}</T>}
              {payout !== null && payout < 0 && <T variant="semibold" className="rounded-xl bg-brand-soft px-3 py-2">You owe the bank {formatPounds(-payout)}</T>}
              {mine.adjust_pence !== 0 && <Muted className="text-xs">Includes {formatPounds(Math.abs(mine.adjust_pence))} {mine.adjust_pence < 0 ? "less" : "more"} as your share of a counting difference.</Muted>}
            </Card>
          );
        }
        return (
          <Card key={mine.id} className="gap-3">
            <View className="flex-row items-baseline justify-between">
              <T variant="display" className="text-xl">Your result{table ? ` · ${table.name}` : ""}</T>
              <T variant="display-bold" className={`text-2xl ${mine.net_pence > 0 ? "text-ok" : mine.net_pence < 0 ? "text-danger" : ""}`} testID="my-net">{formatPounds(mine.net_pence, true)}</T>
            </View>
            {mine.adjust_pence !== 0 && (
              <Muted className="text-sm">Includes {formatPounds(Math.abs(mine.adjust_pence))} {mine.adjust_pence < 0 ? "extra" : "back"} as your share of a counting difference at the table.</Muted>
            )}
            {s.imbalancePence !== 0 ? (
              <Muted className="text-sm">The committee is still checking the numbers.</Muted>
            ) : myTransfers.length === 0 ? (
              <T variant="semibold">{myPayments.length ? "✓ All settled up. Nothing left to pay or collect." : "You're all square. Nothing to pay or collect."}</T>
            ) : (
              <View className="gap-1.5">
                {myTransfers.map((t, i) => (
                  <View key={i} className="flex-row items-center gap-3 rounded-xl bg-brand-soft px-3 py-2" testID="transfer">
                    {/* Names and amount wrap on the left, so the button never goes off the screen. */}
                    <View className="min-w-0 flex-1">
                      <T>{t.fromId === mine.id ? <>You pay <T variant="bold">{names.get(t.toId)}</T></> : <><T variant="bold">{names.get(t.fromId)}</T> pays you</>}</T>
                      <T variant="display-bold" className="text-lg">{formatPounds(t.amountPence)}</T>
                    </View>
                    <Pressable onPress={() => void markPaymentPaid(supabase, eventId, t.fromId, t.toId, t.amountPence).then(() => onChange())} className="min-h-11 shrink-0 justify-center rounded-lg bg-surface px-3" testID="mark-paid">
                      <T variant="bold" className="text-sm text-brand">{t.fromId === mine.id ? "I've paid" : "Got it"}</T>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            {myPayments.length > 0 && (
              <View className="gap-1">
                {myPayments.map((p) => (
                  <View key={p.id} className="flex-row items-center justify-between gap-2">
                    <T className="flex-1 text-sm text-ok">
                      ✓ {p.from_row === mine.id ? <>You paid <T variant="bold" className="text-sm text-ok">{names.get(p.to_row)}</T></> : <><T variant="bold" className="text-sm text-ok">{names.get(p.from_row)}</T> paid you</>} {formatPounds(p.amount_pence)}
                    </T>
                    {p.created_by === userId && <LinkButton onPress={() => void undoPaymentMark(supabase, p.id).then(() => onChange())} testID="undo-paid">Undo</LinkButton>}
                  </View>
                ))}
              </View>
            )}
            <WholeTable rows={tableRows} />
          </Card>
        );
      })}
    </View>
  );
}

function WholeTable({ rows }: { rows: LedgerRowRecord[] }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable onPress={() => setOpen((o) => !o)}>
        <T variant="semibold" className="text-sm text-muted">{open ? "▾" : "▸"} Whole table</T>
      </Pressable>
      {open && (
        <View className="mt-2 gap-1">
          {rows.map((r) => (
            <View key={r.id} className="flex-row justify-between">
              <T className="text-sm">{r.player_name}</T>
              <T variant="semibold" className="text-sm">{formatPounds(r.net_pence, true)}</T>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
