import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { chooseTable, confirmSeat, hasEnded, joinEvent, joinTableWaitlist, leaveEvent, leaveTableWaitlist, nowMs, setAlsoTables, takeSeat, type EventTable, type MotiveEvent, type Person, type Queue } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { Flag } from "@/components/flag";
import { PersonCardSheet } from "@/components/profile/person-card-sheet";
import { Button, Card, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { LinkButton, type Tap } from "./panels";

// Poker-style tables with numbered seats: tap an empty seat to sit there,
// "Sit anywhere" for a random one, tap a player for their card.
export function TablesPicker({ event, tables, people, me, queue, tap, busy, onConfirmed, hostIds }: { event: MotiveEvent; tables: EventTable[]; people: Person[]; me: Person | null; queue: Queue; tap: Tap; busy: boolean; onConfirmed: () => void; hostIds?: Set<string> }) {
  // Waiting lists only move people before the event starts.
  const started = new Date(event.starts_at).getTime() <= nowMs() || tables.some((t) => t.started_at);
  const [pick, setPick] = useState<{ table: EventTable; seat: number } | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const finished = hasEnded(event.ends_at);
  const unseated = people.filter((p) => p.status === "going" && (!p.tableId || !tables.some((t) => t.id === p.tableId)));
  const myTable = me?.tableId ? tables.find((t) => t.id === me.tableId) : null;
  return (
    <View className="gap-4" testID="tables">
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <T variant="display" className="text-xl">Pick your table</T>
        {me && <LinkButton onPress={() => void tap(() => leaveEvent(supabase, event.id))} confirmText="Leave this event?" disabled={busy} testID="leave">I can&apos;t make it</LinkButton>}
      </View>

      <View className="gap-4">
        {tables.map((table) => {
          const seated = people.filter((p) => p.status === "going" && p.tableId === table.id);
          const willing = people.filter((p) => p.status === "going" && p.tableId !== table.id && p.alsoTables.includes(table.id));
          const mine = me?.tableId === table.id;
          const full = seated.length >= table.seats;
          const q = queue.get(table.id);
          return (
            <Card key={table.id} className={mine ? "border-brand" : ""} style={mine ? { borderWidth: 2 } : undefined} testID={`table-${table.id}`}>
              <View className="flex-row items-baseline justify-between gap-2">
                <View className="flex-row items-center gap-2">
                  <T variant="display-bold" className="text-lg">{table.name}</T>
                  {table.started_at && !hasEnded(event.ends_at) && (
                    <View className="rounded-full bg-live px-2 py-0.5">
                      <T variant="bold" className="text-[11px] text-white">LIVE</T>
                    </View>
                  )}
                </View>
                <T variant="semibold" className="text-sm text-muted">
                  {table.level && <T variant="semibold" className="text-sm">{table.level} · </T>}
                  {seated.length}/{table.seats}
                </T>
              </View>
              <PokerTable table={table} seated={seated} meId={me?.userId ?? null} hostIds={hostIds} onSeat={!finished && !(full && !mine) ? (seat) => setPick({ table, seat }) : undefined} onPerson={setPerson} />
              {willing.length > 0 && <Muted className="mt-2 text-center text-xs font-sans-semibold">+{willing.length} also happy to play here</Muted>}
              <View className="mt-3 items-center">
                {mine ? (
                  <View className="items-center gap-1.5">
                    <Muted className="text-center text-xs">You&apos;re in Seat {me?.seatNo ?? "?"}. Tap an empty seat to move (the committee may reshuffle the table).</Muted>
                    <Button variant="ghost" className="py-2" onPress={() => void tap(() => chooseTable(supabase, event.id, null))} disabled={busy} testID="leave-table">Leave this table</Button>
                  </View>
                ) : full ? (
                  <View className="items-center gap-1.5">
                    <T variant="semibold" className="text-sm text-muted">Table full{q?.waiting ? ` · ${q.waiting} waiting` : ""}</T>
                    {me && q?.myPosition ? (
                      <>
                        <T variant="bold" className="text-sm text-brand" testID="waitlist-position">You&apos;re number {q.myPosition} on the waiting list</T>
                        {!started && <LinkButton onPress={() => void tap(() => leaveTableWaitlist(supabase, event.id))} disabled={busy} testID="leave-waitlist">Leave waiting list</LinkButton>}
                      </>
                    ) : me && !started ? (
                      <Button variant="ghost" className="py-2" onPress={() => void tap(() => joinTableWaitlist(supabase, event.id, table.id))} disabled={busy} testID="join-waitlist">Join waiting list</Button>
                    ) : null}
                  </View>
                ) : (
                  <View className="items-center gap-1.5">
                    <Button className="py-2" onPress={() => void tap(() => takeSeat(supabase, event.id, table.id, null))} disabled={busy || finished} testID="sit">{me?.tableId ? "Move here (any seat)" : "Sit anywhere"}</Button>
                    <Muted className="text-xs">or tap an empty seat</Muted>
                  </View>
                )}
              </View>
            </Card>
          );
        })}
      </View>

      {me && [...queue.values()].some((q) => q.myPosition) && !started && (
        <Muted className="text-sm">If a seat opens on the table you&apos;re waiting for before the start, you&apos;ll be moved across automatically and told in Notifications.</Muted>
      )}
      {me && <AlsoTables eventId={event.id} tables={tables} myTableId={me.tableId} selected={me.alsoTables} />}

      {/* Only ask to confirm when there's something new to confirm. */}
      {me?.tableId && myTable && me.confirmedTableId !== me.tableId && (
        <Card className="flex-row flex-wrap items-center justify-between gap-3 border-brand bg-brand-soft" testID="confirm-card">
          <T variant="semibold" className="flex-1">
            {me.confirmedTableId ? "You've moved to " : "You're at "}{myTable.name}{myTable.level ? ` · ${myTable.level}` : ""}
          </T>
          <Button
            onPress={() =>
              void tap(async () => {
                const r = await confirmSeat(supabase, event.id);
                if (!r.error) onConfirmed();
                return r;
              })
            }
            disabled={busy}
            testID="confirm-seat"
          >
            {me.confirmedTableId ? "Confirm change" : "Confirm my seat"}
          </Button>
        </Card>
      )}

      {!me && (
        <Muted className="text-sm">
          Not sure which table yet?{" "}
          <T variant="semibold" className="text-sm text-brand" onPress={() => void tap(() => joinEvent(supabase, event.id, null))} testID="just-going">Just say I&apos;m going</T>
        </Muted>
      )}

      {/* "Sit here" for the seat that was tapped. */}
      <Modal visible={!!pick} transparent animationType="fade" onRequestClose={() => setPick(null)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setPick(null)}>
          <Pressable className="rounded-t-3xl bg-surface p-5 pb-10" onPress={(e) => e.stopPropagation()} testID="seat-sheet">
            {pick && (
              <View className="gap-3">
                <T variant="display-bold" className="text-lg">Seat {pick.seat} at {pick.table.name}</T>
                <Muted className="text-sm">{me?.tableId === pick.table.id ? "Move to this seat?" : me?.tableId ? "Move to this table and take this seat?" : "Take this seat? You keep it unless you move or the committee reshuffles the table."}</Muted>
                <View className="flex-row gap-2">
                  <Button
                    className="flex-1"
                    disabled={busy}
                    onPress={() => {
                      const chosen = pick;
                      setPick(null);
                      void tap(() => takeSeat(supabase, event.id, chosen.table.id, chosen.seat));
                    }}
                    testID="sit-here"
                  >
                    Sit here
                  </Button>
                  <Button variant="ghost" onPress={() => setPick(null)}>Cancel</Button>
                </View>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
      <PersonCardSheet userId={person} host={!!person && !!hostIds?.has(person)} onClose={() => setPerson(null)} />
      {unseated.length > 0 && (
        <Card>
          <Muted className="mb-2 text-sm font-sans-semibold">Going, no table yet</Muted>
          <View className="flex-row flex-wrap gap-2">
            {unseated.map((p) => (
              <View key={p.userId} className="flex-row items-center gap-1.5 rounded-full bg-bg py-1 pl-1 pr-3">
                <Avatar name={p.name} url={p.avatarUrl} size={24} ring={p.userId === me?.userId} />
                <T variant="semibold" className="text-sm">{p.name}</T>
              </View>
            ))}
          </View>
        </Card>
      )}
    </View>
  );
}

// Green felt with numbered seats around the edge. Players sit at their own
// seat number; an empty seat shows its number and can be tapped. Hosts (the
// committee) get an amber ring.
export function PokerTable({ table, seated, meId, hostIds, onSeat, onPerson }: { table: EventTable; seated: Person[]; meId: string | null; hostIds?: Set<string>; onSeat?: (seat: number) => void; onPerson?: (userId: string) => void }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const seats = table.seats;
  // Anyone without a number yet (shouldn't happen) is shown in the first empty seats.
  const bySeat = new Map<number, Person>();
  for (const p of seated) if (p.seatNo && p.seatNo <= seats && !bySeat.has(p.seatNo)) bySeat.set(p.seatNo, p);
  for (const p of seated) {
    if (bySeat.get(p.seatNo ?? -1) === p) continue;
    for (let n = 1; n <= seats; n++) if (!bySeat.has(n)) { bySeat.set(n, p); break; }
  }
  return (
    <View className="mx-auto mt-4 w-full max-w-sm" style={{ aspectRatio: 16 / 10 }} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} testID={`felt-${table.id}`}>
      <View className="absolute rounded-full" style={{ left: "16%", right: "16%", top: "16%", bottom: "16%", borderWidth: 6, borderColor: "#5b3a1e", backgroundColor: "#1a7a44" }} />
      {size.w > 0 &&
        Array.from({ length: seats }, (_, i) => {
          const n = i + 1;
          // Seats spaced evenly around an ellipse, Seat 1 at the top, clockwise.
          const angle = (i / seats) * 2 * Math.PI - Math.PI / 2;
          const cx = size.w * (0.5 + 0.44 * Math.cos(angle));
          const cy = size.h * (0.5 + 0.4 * Math.sin(angle));
          const person = bySeat.get(n);
          // Seats along the top edge put their label above the circle so it isn't hidden by the felt.
          const above = Math.sin(angle) < -0.3;
          return (
            <View key={n} className="absolute items-center" style={{ left: cx - 32, top: cy - (above ? (person ? 36 : 32) : person ? 17 : 15), width: 64, flexDirection: above ? "column-reverse" : "column" }}>
              {person ? (
                <Pressable onPress={onPerson ? () => onPerson(person.userId) : undefined} accessibilityLabel={`Seat ${n}: ${person.name}`} className="items-center" testID={`seat-player-${person.userId}`}>
                  <Avatar name={person.name} url={person.avatarUrl} size={34} ring={person.userId === meId || !!hostIds?.has(person.userId)} ringColor={person.userId === meId ? undefined : "#b45309"} />
                  <View className={`${above ? "mb-0.5" : "mt-0.5"} max-w-16 flex-row items-center gap-0.5 rounded bg-surface/90 px-1`}>
                    <T variant="bold" className="shrink text-[10px] leading-3" numberOfLines={1}>{n} · {person.userId === meId ? "You" : person.name.split(" ")[0]}</T>
                    <Flag code={person.country} size={9} />
                  </View>
                </Pressable>
              ) : (
                <Pressable onPress={onSeat ? () => onSeat(n) : undefined} disabled={!onSeat} accessibilityLabel={`Seat ${n}, empty`} className="items-center" testID={`seat-${table.id}-${n}`}>
                  <View className="h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-dashed border-line bg-surface/60">
                    <T variant="bold" className="text-[11px] text-muted">{n}</T>
                  </View>
                  <View className={`${above ? "mb-0.5" : "mt-0.5"} rounded bg-surface/90 px-1`}>
                    <T variant="bold" className="text-[10px] leading-3 text-muted">Seat {n}</T>
                  </View>
                </Pressable>
              )}
            </View>
          );
        })}
    </View>
  );
}

// "I'd also happily play at…" so the committee can fill short tables quickly.
function AlsoTables({ eventId, tables, myTableId, selected }: { eventId: string; tables: EventTable[]; myTableId: string | null; selected: string[] }) {
  const [chosen, setChosen] = useState<string[]>(selected);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = tables.filter((t) => t.id !== myTableId);
  if (others.length === 0) return null;

  async function toggle(id: string) {
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
    setChosen(next);
    setError(null);
    setSaving(true);
    const result = await setAlsoTables(supabase, eventId, next);
    setSaving(false);
    if (result.error) setError(result.error);
  }

  return (
    <Card testID="also-tables">
      <T variant="semibold">Also happy to play at</T>
      <Muted className="mb-3 text-sm">Tick any other tables you&apos;d move to. It helps the committee fill tables.</Muted>
      <View className="flex-row flex-wrap gap-2">
        {others.map((t) => {
          const on = chosen.includes(t.id);
          return (
            <Pressable key={t.id} onPress={() => void toggle(t.id)} accessibilityState={{ selected: on }} testID={`also-${t.id}`} className={`rounded-full border px-3.5 py-1.5 ${on ? "border-brand bg-brand" : "border-line bg-surface"}`}>
              <T variant="semibold" className={`text-sm ${on ? "text-brand-ink" : ""}`}>
                {on ? "✓ " : ""}{t.level || t.name}{t.level ? ` · ${t.name}` : ""}
              </T>
            </Pressable>
          );
        })}
      </View>
      {saving && <Muted className="mt-2 text-xs">Saving…</Muted>}
      {error && <T variant="semibold" className="mt-2 text-sm text-danger">{error}</T>}
    </Card>
  );
}
