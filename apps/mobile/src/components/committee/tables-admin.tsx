import { useState } from "react";
import { Pressable, View } from "react-native";
import { addLateArrival, moveEntry, randomiseSeats, removeEntry, setTableStarted, type EventTable, type Person } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { LinkButton, type Tap } from "@/components/event/panels";
import { Select } from "@/components/select";
import { Button, Card, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });

// The committee's tables: who's where, start/undo, move and remove.
export function TablesAdmin({ eventId, tables, people, eventStarted, finished, tap, busy }: { eventId: string; tables: EventTable[]; people: Person[]; eventStarted: boolean; finished: boolean; tap: Tap; busy: boolean }) {
  const groups = [...tables.map((t) => ({ table: t as EventTable | null, list: people.filter((p) => p.tableId === t.id) })), { table: null, list: people.filter((p) => !p.tableId || !tables.some((t) => t.id === p.tableId)) }];
  const tableOptions = [{ value: "", label: "No table" }, ...tables.map((t) => ({ value: t.id, label: t.name }))];
  return (
    <View className="mt-3 gap-4" testID="tables-admin">
      {groups.map(({ table, list }) =>
        !table && list.length === 0 ? null : (
          <Card key={table?.id ?? "none"} testID={table ? `admin-table-${table.id}` : "admin-no-table"}>
            <View className="flex-row items-baseline justify-between">
              <T variant="display-bold" className="text-lg">{table ? table.name : "No table yet"}</T>
              {table && <T variant="semibold" className={`text-sm ${list.length >= table.seats ? "text-danger" : "text-muted"}`}>{table.level ? `${table.level} · ` : ""}{list.length}/{table.seats}</T>}
            </View>
            {table &&
              !finished &&
              (table.started_at ? (
                <View className="mt-2 flex-row items-center gap-3">
                  <View className="rounded-full bg-live px-2 py-0.5">
                    <T variant="bold" className="text-xs text-white">LIVE</T>
                  </View>
                  <Muted className="text-sm">Started {time(table.started_at)}</Muted>
                  <LinkButton onPress={() => void tap(() => setTableStarted(supabase, eventId, table.id, false))} disabled={busy} testID="undo-start">Undo</LinkButton>
                </View>
              ) : !eventStarted ? (
                <Button className="mt-2 self-start py-1.5" onPress={() => void tap(() => setTableStarted(supabase, eventId, table.id, true))} disabled={busy} testID="start-table">▶ Start table now</Button>
              ) : null)}
            {table &&
              (() => {
                const willing = people.filter((p) => p.tableId !== table.id && p.alsoTables.includes(table.id));
                return willing.length > 0 ? (
                  <View className="mt-3 rounded-xl bg-brand-soft p-2.5">
                    <T variant="bold" className="mb-1.5 text-xs text-brand">Also happy to play here</T>
                    <View className="gap-1.5">
                      {willing.map((p) => (
                        <View key={p.userId} className="flex-row items-center justify-between gap-2">
                          <View className="flex-row items-center gap-2">
                            <Avatar name={p.name} url={p.avatarUrl} size={22} />
                            <T variant="semibold" className="text-sm">{p.name}</T>
                            <Muted className="text-xs">{tables.find((t) => t.id === p.tableId)?.name ?? "no table"}</Muted>
                          </View>
                          <Pressable onPress={() => void tap(() => moveEntry(supabase, eventId, p.userId, table.id))} disabled={busy} testID={`move-here-${p.userId}`}>
                            <T variant="bold" className="text-xs text-brand">Move here</T>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null;
              })()}
            {list.length === 0 ? (
              <Muted className="mt-2 text-sm">Empty</Muted>
            ) : (
              <View className="mt-3 gap-2">
                {table && list.length > 1 && !finished && (
                  <View className="flex-row items-center justify-between gap-2">
                    <Muted className="flex-1 text-xs">Seats are numbered. Reshuffle for fairness; everyone gets told their new seat.</Muted>
                    <LinkButton onPress={() => void tap(() => randomiseSeats(supabase, eventId, table.id))} confirmText={`Randomise the seating at ${table.name}? Everyone there gets a new seat number and a notification.`} disabled={busy} testID={`randomise-${table.id}`}>Randomise seating</LinkButton>
                  </View>
                )}
                {[...list].sort((a, b) => (a.seatNo ?? 99) - (b.seatNo ?? 99)).map((p) => (
                  <View key={p.userId} className="flex-row items-center justify-between gap-2" testID={`seated-${p.userId}`}>
                    <View className="min-w-0 flex-1 flex-row items-center gap-2">
                      {table && <T variant="bold" className="w-14 text-xs text-muted" testID={`seat-of-${p.userId}`}>{p.seatNo ? `Seat ${p.seatNo}` : ""}</T>}
                      <Avatar name={p.name} url={p.avatarUrl} size={28} />
                      <T variant="semibold" numberOfLines={1}>{p.name}</T>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <Select value={p.tableId ?? ""} options={tableOptions} onChange={(v) => void tap(() => moveEntry(supabase, eventId, p.userId, v || null))} accessibilityLabel={`Move ${p.name}`} className="min-h-9 py-1" testID={`move-${p.userId}`} />
                      <LinkButton onPress={() => void tap(() => removeEntry(supabase, eventId, p.userId))} disabled={busy} danger testID={`remove-${p.userId}`}>✕</LinkButton>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card>
        ),
      )}
    </View>
  );
}

// For people who turn up late or without their phone.
export function LateArrival({ eventId, members, tables, tap, busy }: { eventId: string; members: { userId: string; name: string }[]; tables: EventTable[]; tap: Tap; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [tableId, setTableId] = useState(tables[0]?.id ?? "");
  if (members.length === 0) return null;
  return (
    <Card className="mt-4">
      <Pressable onPress={() => setOpen((o) => !o)} testID="late-arrival">
        <T variant="semibold">+ Add someone (arrived late or no phone)</T>
      </Pressable>
      {open && (
        <View className="mt-3 gap-2">
          <Select value={userId} onChange={setUserId} options={members.map((m) => ({ value: m.userId, label: m.name }))} placeholder="Choose a member" accessibilityLabel="Member" testID="late-member" />
          {tables.length > 0 && <Select value={tableId} onChange={setTableId} options={[...tables.map((t) => ({ value: t.id, label: `${t.name}${t.level ? ` · ${t.level}` : ""}` })), { value: "", label: "No table yet" }]} accessibilityLabel="Table" testID="late-table" />}
          <Button
            className="self-start"
            disabled={busy}
            onPress={() =>
              void tap(async () => {
                const r = await addLateArrival(supabase, eventId, userId, tableId || null);
                if (!r.error) setUserId("");
                return r;
              })
            }
            testID="late-add"
          >
            Add
          </Button>
          <Muted className="text-xs">Not a member on Function? Add them by name in the results below instead.</Muted>
        </View>
      )}
    </Card>
  );
}
