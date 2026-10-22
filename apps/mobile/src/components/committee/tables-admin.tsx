import { useState } from "react";
import { Pressable, View } from "react-native";
import { addGuestPlayer, addLateArrival, matchMembers, moveEntry, randomiseSeats, removeEntry, removeGuestPlayer, setTableStarted, type EventTable, type LedgerRowRecord, type Person } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { LinkButton, type Tap } from "@/components/event/panels";
import { Select } from "@/components/select";
import { Button, Card, Input, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });

// The committee's tables: who's where, start/undo, move and remove. Players
// who aren't on Function (guests) are listed at their table too.
export function TablesAdmin({ eventId, tables, people, guests = [], eventStarted, finished, tap, busy }: { eventId: string; tables: EventTable[]; people: Person[]; guests?: LedgerRowRecord[]; eventStarted: boolean; finished: boolean; tap: Tap; busy: boolean }) {
  const groups = [...tables.map((t) => ({ table: t as EventTable | null, list: people.filter((p) => p.tableId === t.id), guestList: guests.filter((g) => g.table_id === t.id) })), { table: null, list: people.filter((p) => !p.tableId || !tables.some((t) => t.id === p.tableId)), guestList: guests.filter((g) => !g.table_id || !tables.some((t) => t.id === g.table_id)) }];
  const tableOptions = [{ value: "", label: "No table" }, ...tables.map((t) => ({ value: t.id, label: t.name }))];
  return (
    <View className="mt-3 gap-4" testID="tables-admin">
      {groups.map(({ table, list, guestList }) =>
        !table && list.length === 0 && guestList.length === 0 ? null : (
          <Card key={table?.id ?? "none"} testID={table ? `admin-table-${table.id}` : "admin-no-table"}>
            <View className="flex-row items-baseline justify-between">
              <T variant="display-bold" className="text-lg">{table ? table.name : "No table yet"}</T>
              {table && <T variant="semibold" className={`text-sm ${list.length + guestList.length >= table.seats ? "text-danger" : "text-muted"}`}>{table.level ? `${table.level} · ` : ""}{list.length + guestList.length}/{table.seats}</T>}
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
            {list.length === 0 && guestList.length === 0 ? (
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
                {guestList.map((g) => (
                  <View key={g.id} className="flex-row items-center justify-between gap-2" testID={`guest-${g.id}`}>
                    <View className="min-w-0 flex-1 flex-row items-center gap-2">
                      {table && <View className="w-14" />}
                      <Avatar name={g.player_name} url={null} size={28} />
                      <View className="min-w-0 flex-1">
                        <T variant="semibold" numberOfLines={1}>{g.player_name}</T>
                        <Muted className="text-xs">Not on Function</Muted>
                      </View>
                    </View>
                    <LinkButton onPress={() => void tap(() => removeGuestPlayer(supabase, eventId, g.id))} confirmText={`Take ${g.player_name} off this event? Their results go too.`} disabled={busy} danger testID={`remove-guest-${g.id}`}>✕</LinkButton>
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

// Adding players, at the top of the manage page: members who turned up
// late or without their phone, and (with results on) people who aren't on
// Function, typed in by name. Typing a name suggests the society's members;
// ticking "This person isn't on Function" stops the suggestions. It stays
// open after adding, to add more.
export function AddPlayer({ eventId, members, tables, guestsAllowed, tap, busy }: { eventId: string; members: { userId: string; name: string }[]; tables: EventTable[]; guestsAllowed: boolean; tap: Tap; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<{ userId: string; name: string } | null>(null);
  const [notOnFunction, setNotOnFunction] = useState(false);
  const [tableId, setTableId] = useState(tables[0]?.id ?? "");
  const [added, setAdded] = useState<string | null>(null);
  if (members.length === 0 && !guestsAllowed) return null;
  const suggestions = notOnFunction || picked ? [] : matchMembers(members, name);
  const guest = guestsAllowed && notOnFunction;
  const ready = guest ? name.trim().length > 0 : !!picked;
  const table = tables.length > 0 ? tableId || null : null;

  async function add() {
    const who = guest ? name.trim() : picked!.name;
    const r = guest ? await addGuestPlayer(supabase, eventId, table, name) : await addLateArrival(supabase, eventId, picked!.userId, table);
    if (!r.error) {
      setName("");
      setPicked(null);
      setAdded(who);
    }
    return r;
  }

  return (
    <Card className="mt-3 gap-3" testID="add-player-card">
      <Pressable onPress={() => setOpen((o) => !o)} className="min-h-11 justify-center" testID="late-arrival">
        <T variant="semibold" className="text-brand">+ Add a player</T>
        <Muted className="text-xs">{guestsAllowed ? "Arrived late, no phone, or not on Function" : "Arrived late or no phone"}</Muted>
      </Pressable>
      {open && (
        <View className="gap-3">
          <View>
            <Input
              value={picked ? picked.name : name}
              onChangeText={(v) => {
                setPicked(null);
                setAdded(null);
                setName(v);
              }}
              placeholder={guest ? "Their name" : "Start typing a member's name"}
              maxLength={60}
              autoCorrect={false}
              accessibilityLabel="Player's name"
              testID="add-player-name"
            />
            {suggestions.length > 0 && (
              <View className="mt-1 overflow-hidden rounded-xl border border-line bg-surface" testID="member-suggestions">
                {suggestions.map((m, i) => (
                  <Pressable key={m.userId} onPress={() => setPicked(m)} className={`min-h-11 flex-row items-center gap-2 px-3 py-2 active:opacity-80 ${i ? "border-t border-line" : ""}`} testID={`suggest-${m.userId}`}>
                    <Avatar name={m.name} url={null} size={24} />
                    <T variant="semibold">{m.name}</T>
                  </Pressable>
                ))}
              </View>
            )}
            {!guest && !picked && name.trim().length > 1 && suggestions.length === 0 && (
              <Muted className="mt-1 text-xs">No member called that.{guestsAllowed ? " Tick the box below to add them anyway." : ""}</Muted>
            )}
          </View>
          {guestsAllowed && (
            <Pressable
              onPress={() => {
                setNotOnFunction((v) => !v);
                setPicked(null);
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: notOnFunction }}
              aria-checked={notOnFunction}
              className="flex-row items-center gap-3"
              testID="not-on-function"
            >
              <View className={`h-5 w-5 items-center justify-center rounded-md border ${notOnFunction ? "border-brand bg-brand" : "border-line bg-surface"}`}>{notOnFunction && <T variant="bold" className="text-xs text-brand-ink">✓</T>}</View>
              <T variant="semibold" className="flex-1 text-sm">This person isn&apos;t on Function</T>
            </Pressable>
          )}
          {tables.length > 0 && <Select value={tableId} onChange={setTableId} options={[...tables.map((t) => ({ value: t.id, label: `${t.name}${t.level ? ` · ${t.level}` : ""}` })), { value: "", label: "No table yet" }]} accessibilityLabel="Table" testID="late-table" />}
          <Button className="self-start" disabled={busy || !ready} onPress={() => void tap(add)} testID="late-add">
            Add
          </Button>
          {added && <T variant="semibold" className="text-sm text-ok" testID="player-added">✓ {added} added. Add another, or close.</T>}
          {guestsAllowed && <Muted className="text-xs">Everyone added here shows in their table&apos;s results automatically.</Muted>}
        </View>
      )}
    </Card>
  );
}
