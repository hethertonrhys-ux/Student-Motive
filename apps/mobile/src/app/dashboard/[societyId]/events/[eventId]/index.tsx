import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { audienceLabel, bankEditorRows, eventAdminAvailable, FORMATS, formatEventTime, hasEnded, hasFeature, loadManagedSociety, loadManageEvent, nowMs, promoteEntry, removeEntry, savePositions, setResultsPublished, setTableBank, type EventTable, type Society, startingRows, type Person } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { Avatar } from "@/components/avatar";
import { EventAdminCard } from "@/components/committee/event-admin-card";
import { AddPlayer, TablesAdmin } from "@/components/committee/tables-admin";
import { LedgerEditor } from "@/components/committee/ledger-editor";
import { BankLedger } from "@/components/event/bank-ledger";
import { LinkButton, type Tap } from "@/components/event/panels";
import { Select } from "@/components/select";
import { Button, Card, Heading, Input, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// The committee's view of one event: the Event admin card (LSE societies
// with Event admin on: the SU form, checklist and Security email), who's
// coming (tables, entries, the waiting list, late arrivals), and results
// and settling up per table (if the society uses the settle-up ledger, or
// this event already does).
export default function ManageEventScreen() {
  const { societyId, eventId } = useLocalSearchParams<{ societyId: string; eventId: string }>();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const managed = useQuery({ queryKey: ["managed", societyId], queryFn: () => loadManagedSociety(supabase, societyId), enabled: !!session && !!societyId });
  const page = useQuery({ queryKey: ["manage-event", societyId, eventId], queryFn: () => loadManageEvent(supabase, societyId, eventId), enabled: !!managed.data });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["manage-event", societyId, eventId] }), queryClient.invalidateQueries({ queryKey: ["event", eventId] }), queryClient.invalidateQueries({ queryKey: ["participation", eventId] }), queryClient.invalidateQueries({ queryKey: ["map-events"] })]);
  const tap: Tap = async (run) => {
    setBusy(true);
    setError(null);
    try {
      const r = await run();
      if (r.error) setError(r.error);
      else await refresh();
    } finally {
      setBusy(false);
    }
  };
  const society = managed.data?.society;
  const d = page.data;
  // Event admin: LSE societies (the unis it's set up for) with it switched on.
  const adminSociety = society && hasFeature(managed.data?.features, "event_admin") && eventAdminAvailable(society.university) ? society : null;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10" keyboardShouldPersistTaps="handled">
        <BackButton fallback={`/dashboard/${societyId}`} />
        {!society || !d ? (
          <Muted className="mt-3">{managed.isPending || page.isPending ? "Loading…" : "Event not found."}</Muted>
        ) : (
          <ManageBody societyId={societyId} eventId={eventId} uni={society.university} ledgerOn={hasFeature(managed.data?.features, "ledger")} adminSociety={adminSociety} d={d} tap={tap} busy={busy} error={error} refresh={refresh} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ManageBody({ societyId, eventId, uni, ledgerOn, adminSociety, d, tap, busy, error, refresh }: { societyId: string; eventId: string; uni: string; ledgerOn: boolean; adminSociety: Society | null; d: NonNullable<Awaited<ReturnType<typeof loadManageEvent>>>; tap: Tap; busy: boolean; error: string | null; refresh: () => Promise<unknown> }) {
  const { event, people, tables, ledger, notComing } = d;
  const going = people.filter((p) => p.status === "going");
  const waitlist = people.filter((p) => p.status === "waitlist");
  const finished = hasEnded(event.ends_at);
  const formatLabel = FORMATS.find((f) => f.value === event.format)?.label;
  const [positions, setPositions] = useState<Record<string, string>>(() => Object.fromEntries(going.map((p) => [p.userId, p.finishPosition ? String(p.finishPosition) : ""])));
  // Switching the ledger off doesn't take it away from an event already using it.
  const ledgerShown = ledgerOn || event.results_published || ledger.rows.length > 0 || ledger.payments.length > 0 || tables.some((t) => t.bank_user_id);
  // Players who aren't on Function: their results line is how they're on the event.
  const guests = ledger.rows.filter((r) => !r.user_id);
  const guestsAllowed = ledgerShown && event.format !== "entries";

  return (
    <>
      <Heading className="mt-3">{event.title}</Heading>
      <Muted>
        {formatEventTime(event.starts_at, event.ends_at)} · {formatLabel} · {audienceLabel(event.audience, uni)}{event.members_only && event.audience !== "members" && " · Only members can join"}
      </Muted>
      <View className="mt-3 flex-row gap-2">
        <Link href={`/e/${eventId}` as never} asChild><Button variant="ghost" className="py-2">View</Button></Link>
        <Link href={`/dashboard/${societyId}/events/${eventId}/edit` as never} asChild><Button variant="ghost" className="py-2">Edit</Button></Link>
      </View>
      {error && <T variant="semibold" className="mt-3 text-sm text-danger" testID="manage-error">{error}</T>}

      {adminSociety && <EventAdminCard society={adminSociety} event={event} people={people} onEventChanged={refresh} />}

      {/* Who's coming */}
      <T variant="display" className="mt-8 text-xl" testID="going-heading">
        {event.format === "entries" ? "Entries" : "Going"} ({going.length}{event.format === "entries" && event.capacity ? ` of ${event.capacity}` : ""})
      </T>
      {/* Adding players comes first, and stays open to add more. */}
      {(!finished || event.format === "tables" || guestsAllowed) && <AddPlayer eventId={eventId} members={notComing} tables={event.format === "tables" ? tables : []} guestsAllowed={guestsAllowed} tap={tap} busy={busy} />}
      {event.format === "tables" ? (
        <TablesAdmin eventId={eventId} tables={tables} people={going} guests={guests} eventStarted={new Date(event.starts_at).getTime() <= nowMs()} finished={finished} tap={tap} busy={busy} />
      ) : event.format === "entries" && finished ? (
        <Card className="mt-3 gap-3">
          <Muted className="text-sm">Enter finishing positions (1 = winner). Leave blank for anyone who didn&apos;t place.</Muted>
          {[...going].sort((a, b) => (a.finishPosition ?? 999) - (b.finishPosition ?? 999)).map((p) => (
            <View key={p.userId} className="flex-row items-center gap-3">
              <Input value={positions[p.userId] ?? ""} onChangeText={(v) => setPositions((cur) => ({ ...cur, [p.userId]: v }))} keyboardType="number-pad" className="w-16 text-center" accessibilityLabel={`${p.name} position`} testID={`pos-${p.userId}`} />
              <Avatar name={p.name} url={p.avatarUrl} size={32} />
              <T variant="semibold">{p.name}</T>
            </View>
          ))}
          <Button className="self-start" onPress={() => void tap(() => savePositions(supabase, eventId, Object.entries(positions).map(([userId, position]) => ({ userId, position }))))} disabled={busy} testID="save-positions">Save positions</Button>
        </Card>
      ) : (
        <PeopleList people={going} numbered={event.format === "entries"} onRemove={(uid) => void tap(() => removeEntry(supabase, eventId, uid))} busy={busy} />
      )}
      {waitlist.length > 0 && (
        <View className="mt-6" testID="waitlist">
          <T variant="semibold">Waiting list ({waitlist.length})</T>
          <View className="mt-2 gap-2">
            {waitlist.map((p, i) => (
              <View key={p.userId} className="flex-row items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2" testID={`waitlist-${p.userId}`}>
                <View className="flex-row items-center gap-3">
                  <Muted className="w-5 text-sm">{i + 1}</Muted>
                  <Avatar name={p.name} url={p.avatarUrl} size={28} />
                  <T variant="semibold">{p.name}</T>
                </View>
                <View className="flex-row gap-3">
                  <Pressable onPress={() => void tap(() => promoteEntry(supabase, eventId, p.userId))} disabled={busy} testID="promote"><T variant="semibold" className="text-sm text-brand">Move to entries</T></Pressable>
                  <LinkButton onPress={() => void tap(() => removeEntry(supabase, eventId, p.userId))} disabled={busy} danger>Remove</LinkButton>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Results and who pays who */}
      {ledgerShown && event.format !== "entries" && (
        <View className="mt-12">
          <View className="flex-row flex-wrap items-center justify-between gap-3">
            <View className="flex-1">
              <T variant="display" className="text-xl">Results &amp; who pays who</T>
              <Muted className="text-sm">{event.results_published ? "Players who came can see the results and who they pay." : "Only the committee can see this until you share it."}</Muted>
            </View>
            <Button variant={event.results_published ? "ghost" : "primary"} onPress={() => void tap(() => setResultsPublished(supabase, eventId, !event.results_published))} disabled={busy} testID="share-results">{event.results_published ? "Hide from players" : "Share with players"}</Button>
          </View>
          <View className="mt-4 gap-4">
            {(event.format === "tables" ? tables : [null]).map((table) => {
              const tableId = table?.id ?? null;
              const saved = ledger.rows.filter((r) => r.table_id === tableId);
              const seated = going.filter((p) => (tableId ? p.tableId === tableId : true));
              return (
                <View key={tableId ?? "event"} className="gap-2">
                  {table && <SettleMode eventId={eventId} table={table} seated={seated} tap={tap} busy={busy} />}
                  {table && table.bank_user_id ? (
                    <BankLedger canAddPlayers={false} key={`bank-${tableId}-${seated.map((p) => p.userId).join(",")}-${saved.map((r) => `${r.id}:${r.buyin_pence}:${r.cashout_pence}:${r.paid_out}:${r.adjust_pence}`).join("|")}`} event={event} table={table} initialRows={bankEditorRows(saved, seated)} onSaved={refresh} />
                  ) : (
                    <LedgerEditor
                      key={`${tableId}-${seated.map((p) => p.userId).join(",")}-${saved.map((r) => `${r.id}:${r.net_pence}:${r.player_name}`).join("|")}`}
                      eventId={eventId}
                      tableId={tableId}
                      title={table ? `${table.name}${table.level ? ` · ${table.level}` : ""}` : "Results"}
                      initialRows={startingRows(saved, seated)}
                      payments={ledger.payments.map((p) => ({ ...p, addedBy: p.created_by ? (people.find((x) => x.userId === p.created_by)?.name ?? null) : null }))}
                      onSaved={refresh}
                    />
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}
    </>
  );
}

// How a table settles up, chosen straight away (no separate Set button):
// fewest payments between players, or one player as the banker.
function SettleMode({ eventId, table, seated, tap, busy }: { eventId: string; table: EventTable; seated: Person[]; tap: Tap; busy: boolean }) {
  // Picking "banker" shows who; it's saved once someone's chosen.
  const [choosingBank, setChoosingBank] = useState(false);
  const bank = !!table.bank_user_id || choosingBank;
  const option = (on: boolean, label: string, onPress: () => void, testID: string) => (
    <Pressable onPress={onPress} disabled={busy} accessibilityRole="radio" accessibilityState={{ checked: on }} className={`min-h-11 flex-1 items-center justify-center rounded-xl border px-3 py-2 ${on ? "border-brand bg-brand-soft" : "border-line bg-surface"}`} testID={testID}>
      <T variant="semibold" className={`text-center text-sm ${on ? "text-brand" : ""}`}>{label}</T>
    </Pressable>
  );
  return (
    <View className="rounded-xl border border-line bg-surface p-3" testID={`bank-pick-${table.id}`}>
      <T variant="semibold">How {table.name} settles up</T>
      <View className="mt-2 flex-row gap-2">
        {option(!bank, "Fewest payments", () => {
          setChoosingBank(false);
          if (table.bank_user_id) void tap(() => setTableBank(supabase, eventId, table.id, null));
        }, `settle-fewest-${table.id}`)}
        {option(bank, "One player is the banker", () => setChoosingBank(true), `settle-bank-${table.id}`)}
      </View>
      {bank && (
        <View className="mt-2">
          <Select
            value={table.bank_user_id ?? ""}
            onChange={(v) => void tap(() => setTableBank(supabase, eventId, table.id, v || null))}
            options={seated.map((p) => ({ value: p.userId, label: p.name }))}
            placeholder={seated.length ? "Who's the banker?" : "Seat someone at this table first"}
            accessibilityLabel={`Banker for ${table.name}`}
            testID={`bank-select-${table.id}`}
          />
        </View>
      )}
      <Muted className="mt-1.5 text-xs">{bank ? "The banker records buy-ins and cash-outs, and everyone pays or is paid by them." : "Enter everyone's result and the app works out the fewest payments between players."}</Muted>
    </View>
  );
}

function PeopleList({ people, numbered, onRemove, busy }: { people: Person[]; numbered: boolean; onRemove: (uid: string) => void; busy: boolean }) {
  if (people.length === 0) return <Muted className="mt-2">Nobody yet.</Muted>;
  return (
    <View className="mt-3 gap-2" testID="people-list">
      {people.map((p, i) => (
        <View key={p.userId} className="flex-row items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2" testID={`going-${p.userId}`}>
          <View className="flex-row items-center gap-3">
            {numbered && <Muted className="w-5 text-sm">{i + 1}</Muted>}
            <Avatar name={p.name} url={p.avatarUrl} size={28} />
            <T variant="semibold">{p.name}</T>
          </View>
          <LinkButton onPress={() => onRemove(p.userId)} confirmText={`Remove ${p.name} from this event?`} disabled={busy} danger testID="remove-going">Remove</LinkButton>
        </View>
      ))}
    </View>
  );
}
