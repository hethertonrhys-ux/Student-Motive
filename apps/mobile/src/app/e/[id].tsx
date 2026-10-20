import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Link, useIsFocused, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { audienceLabel, bankEditorRows, categoryLabel, eventAdminAvailable, type EventWithDetails, featureSubject, formatCost, formatEventTime, getCards, hasEnded, hasFeature, isLive, loadEvent, loadEventAdmin, loadEventChat, loadEventHosts, loadParticipation, nowMs, type Participation, type PersonCard, publishEvent, reportEvent, setSuApproved, uniShort } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { Avatar } from "@/components/avatar";
import { CompleteProfileCard } from "@/components/complete-profile-card";
import { Icon } from "@/components/icon";
import { PushPromptCard } from "@/components/push-prompt";
import { ReportLink } from "@/components/report-link";
import { BankLedger, MyBankLine } from "@/components/event/bank-ledger";
import { MyResults } from "@/components/event/my-results";
import { EntryPanel, GoingPanel, HostedJoinCard, NameForm, PeopleSection, PersonRow, WhosComing, type HostedStatus, type Tap } from "@/components/event/panels";
import { SelfReport } from "@/components/event/self-report";
import { TablesPicker } from "@/components/event/tables-picker";
import { ShareButton } from "@/components/share-button";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { SITE_URL } from "@/lib/site";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

type Entry = { user_id: string; status: "going" | "waitlist" | "requested"; created_at: string };
type Exact = { address: string | null; lat: number | null; lng: number | null } | null;

// A society event (or a student-hosted one): the details, who can come,
// and everything about taking part: I'm going, sign-up lists, tables and
// waiting lists, the bank, your own result, and who pays who at the end.
// A draft (only its committee can load it) shows a banner to tick "SU
// approved" and publish it instead of the ways to take part.
export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? null;

  const event = useQuery({ queryKey: ["event", id], queryFn: () => loadEvent(supabase, id), enabled: !!id });
  const ev = event.data;
  const hosted = Boolean(ev?.host_user_id);
  // Student-hosted events: who's hosting, the exact address if you may see it, and the guest list.
  const hostInfo = useQuery({
    queryKey: ["event-host", id, userId],
    enabled: !!ev && hosted,
    queryFn: async () => {
      const [cards, { data: exact }, { data: entryRows }] = await Promise.all([
        getCards(supabase, [ev!.host_user_id!]),
        supabase.from("event_private_details").select("address, lat, lng").eq("event_id", ev!.id).maybeSingle<NonNullable<Exact>>(),
        userId ? supabase.from("event_entries").select("user_id, status, created_at").eq("event_id", ev!.id).order("created_at") : Promise.resolve({ data: [] as Entry[] }),
      ]);
      const entries = (entryRows ?? []) as Entry[];
      const guestCards = await getCards(supabase, entries.map((e) => e.user_id));
      return { host: cards.get(ev!.host_user_id!) ?? null, exact: exact ?? null, entries, guestCards };
    },
  });
  const focused = useIsFocused();
  // The event's group chat and who its hosts are (only people in the chat get the id back).
  const chat = useQuery({
    queryKey: ["event-chat", id, userId],
    enabled: !!ev && !!userId,
    queryFn: async () => {
      const [chatId, hostIds] = await Promise.all([loadEventChat(supabase, ev!.id), loadEventHosts(supabase, ev!.id)]);
      return { chatId, hostIds };
    },
  });
  const part = useQuery({
    queryKey: ["participation", id, userId],
    enabled: !!ev && !hosted && !!userId,
    queryFn: () => loadParticipation(supabase, ev!.id, ev!.society_id, ev!.format, userId!),
    // Poker tables: other players sitting down or a reshuffle show up without a tap.
    refetchInterval: focused && ev?.format === "tables" && !hasEnded(ev.ends_at) ? 30_000 : false,
  });

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [seatConfirmed, setSeatConfirmed] = useState(false);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["event", id] }),
      queryClient.invalidateQueries({ queryKey: ["participation", id] }),
      queryClient.invalidateQueries({ queryKey: ["event-host", id] }),
      queryClient.invalidateQueries({ queryKey: ["event-chat", id] }),
      queryClient.invalidateQueries({ queryKey: ["threads"] }),
      queryClient.invalidateQueries({ queryKey: ["feed"] }),
      queryClient.invalidateQueries({ queryKey: ["map-events"] }),
      queryClient.invalidateQueries({ queryKey: ["recommended"] }),
      queryClient.invalidateQueries({ queryKey: ["profile"] }), // the name form changes it
    ]);
  // One tap: run it, show its error if any, then reload what changed.
  const tap: Tap = async (run) => {
    setBusy(true);
    setActionError(null);
    try {
      const result = await run();
      if (result.error) setActionError(result.error);
      else await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (event.isPending) return <Screen><Muted>Loading…</Muted></Screen>;
  if (!ev) {
    return (
      <Screen>
        <Heading>Event not found</Heading>
        <Muted className="mt-2">It may have been removed, or it&apos;s not open to you.</Muted>
      </Screen>
    );
  }

  const host = hostInfo.data?.host ?? null;
  const exact = hostInfo.data?.exact ?? null;
  const earlyStart = (ev.event_tables ?? []).some((t) => t.started_at) && !hasEnded(ev.ends_at);
  const live = !ev.is_cancelled && (isLive(ev.starts_at, ev.ends_at) || earlyStart);
  const finished = hasEnded(ev.ends_at);
  const cost = formatCost(ev.cost_pence);
  const pin = ev.venues ? { lat: ev.venues.lat, lng: ev.venues.lng } : exact?.lat != null && exact?.lng != null ? { lat: exact.lat, lng: exact.lng } : ev.lat != null && ev.lng != null ? { lat: ev.lat, lng: ev.lng } : null;
  // For hosted events, only link to directions once you can see the exact spot.
  const mapsUrl = pin && (!hosted || exact) ? `https://www.google.com/maps/search/?api=1&query=${pin.lat},${pin.lng}` : null;

  return (
    <Screen>
      {ev.is_draft && <DraftBanner event={ev} onPublished={refresh} />}
      {ev.image_url && <Image source={{ uri: ev.image_url }} style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 16, marginBottom: 24 }} contentFit="cover" />}
      <View className="flex-row flex-wrap items-center gap-2">
        {live && <Badge className="bg-live" textClassName="text-white">LIVE NOW</Badge>}
        {ev.is_cancelled && <Badge className="bg-danger/10" textClassName="text-danger">Cancelled</Badge>}
        {finished && !ev.is_cancelled && <Badge className="bg-line" textClassName="text-muted">Finished</Badge>}
        <Badge>{categoryLabel(ev.category)}</Badge>
        {ev.free_food && <Badge>Free food</Badge>}
        {hosted && ev.visibility === "friends" && <Badge>Friends only</Badge>}
      </View>
      <Heading className="mt-3 text-4xl leading-tight">{ev.title}</Heading>
      {ev.societies && (
        <Link href={`/s/${ev.societies.slug}` as never} asChild>
          <Pressable className="mt-2 self-start">
            <T variant="semibold" className="text-brand">{ev.societies.name}</T>
          </Pressable>
        </Link>
      )}
      {host && (
        <Link href={`/u/${host.id}` as never} asChild>
          <Pressable className="mt-3 flex-row items-center gap-2 self-start">
            <Avatar name={host.name} url={host.avatar_url} size={28} />
            <T variant="semibold">Hosted by <T variant="semibold" className="text-brand">{host.name}</T></T>
          </Pressable>
        </Link>
      )}

      <Card className="mt-6 gap-4">
        <Row label="When">{formatEventTime(ev.starts_at, ev.ends_at)}</Row>
        {(ev.venues || pin) && (
          <View>
            <Muted className="text-sm font-sans-semibold">Where</Muted>
            <T variant="semibold">{ev.venues ? ev.venues.name : ev.location_note || "See the map"}{ev.venues && ev.location_note ? ` · ${ev.location_note}` : ""}</T>
            {ev.venues?.address && <Muted className="text-sm">{ev.venues.address}</Muted>}
            {hosted && (exact?.address ? <T className="text-sm">{exact.address}</T> : <Muted className="text-sm">The exact address is shared with people going.</Muted>)}
            {mapsUrl && (
              <Pressable onPress={() => Linking.openURL(mapsUrl)}>
                <T variant="semibold" className="text-sm text-brand">Open in Maps →</T>
              </Pressable>
            )}
          </View>
        )}
        {cost && <Row label="Cost">{cost === "Free" ? "Free" : `${cost} per person`}</Row>}
        {ev.societies && <Row label="Who can come">{audienceLabel(ev.audience, ev.societies.university)}</Row>}
        <Row label={ev.format === "entries" && !hosted ? "Entered" : "Going"}>{ev.going_count} {ev.going_count === 1 ? "person" : "people"}</Row>
      </Card>

      {!ev.is_cancelled && !ev.is_draft && (
        <View className="mt-6 gap-6">
          {!session ? (
            !finished && (
              <Card className="flex-row flex-wrap items-center justify-between gap-3">
                <T variant="semibold" className="flex-1">{hosted ? "Log in to join." : ev.format === "tables" ? "Log in to pick your table." : ev.format === "entries" ? "Log in to enter." : "Log in to say you're going."}</T>
                <Link href={{ pathname: "/login", params: { next: `/e/${ev.id}` } }} asChild>
                  <Button>Log in</Button>
                </Link>
              </Card>
            )
          ) : hosted ? (
            <HostedPart event={ev} info={hostInfo.data ?? null} userId={userId!} displayName={profile?.display_name ?? null} finished={finished} tap={tap} busy={busy} onNamed={refresh} chatId={chat.data?.chatId ?? null} />
          ) : !profile || part.isPending ? (
            <Muted>Loading…</Muted>
          ) : part.data ? (
            <SocietyPart event={ev} p={part.data} userId={userId!} profile={{ display_name: profile.display_name, university: profile.university }} finished={finished} tap={tap} busy={busy} refresh={refresh} seatConfirmed={seatConfirmed} onConfirmed={() => setSeatConfirmed(true)} chatId={chat.data?.chatId ?? null} hostIds={chat.data?.hostIds} />
          ) : (
            <T variant="semibold" className="text-sm text-danger">Couldn&apos;t load who&apos;s going. Pull down to try again.</T>
          )}
          {actionError && <T variant="semibold" className="text-sm text-danger" testID="action-error">{actionError}</T>}
        </View>
      )}

      {ev.description && <T className="mt-6 text-lg leading-7">{ev.description}</T>}

      <View className="mt-8 flex-row flex-wrap gap-3">
        {ev.ticket_url && <Button onPress={() => Linking.openURL(ev.ticket_url!)}>Tickets / sign up</Button>}
        {!ev.is_draft && <ShareButton url={`${SITE_URL}/e/${ev.id}`} title={ev.title} />}
      </View>
      {userId && ev.host_user_id !== userId && !chat.data?.hostIds.has(userId) && (
        <View className="mt-4">
          <ReportLink send={(reason) => reportEvent(supabase, ev.id, reason)} />
        </View>
      )}

      <Card className="mt-10 bg-brand-soft">
        <T variant="display-bold" className="text-lg">See what&apos;s on in London tonight</T>
        <Muted>Every society event and social on one live map.</Muted>
        <Link href="/(tabs)/map" asChild>
          <Pressable className="mt-2 self-start">
            <T variant="semibold" className="text-brand">Open the live map →</T>
          </Pressable>
        </Link>
      </Card>
    </Screen>
  );
}

// A draft: only the committee sees it. For an LSE society with Event admin
// on, "SU approved" has to be ticked before it can be published (the
// database checks this too); otherwise it can be published straight away.
function DraftBanner({ event, onPublished }: { event: EventWithDetails; onPublished: () => Promise<unknown> }) {
  const queryClient = useQueryClient();
  const society = event.societies;
  const gated = !!society && eventAdminAvailable(society.university) && hasFeature(featureSubject(society), "event_admin");
  const admin = useQuery({ queryKey: ["event-admin", event.id], queryFn: () => loadEventAdmin(supabase, event.id), enabled: gated });
  const approved = Boolean(admin.data?.su_approved_at);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ error?: string }>, after: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    const r = await action();
    if (r.error) setError(r.error);
    else await after();
    setBusy(false);
  }
  const refreshAdmin = () => queryClient.invalidateQueries({ queryKey: ["event-admin", event.id] });
  const published = () =>
    Promise.all([
      onPublished(),
      refreshAdmin(),
      queryClient.invalidateQueries({ queryKey: ["managed", event.society_id] }),
      queryClient.invalidateQueries({ queryKey: ["edit-event", event.society_id, event.id] }),
      queryClient.invalidateQueries({ queryKey: ["manage-event", event.society_id, event.id] }),
      queryClient.invalidateQueries({ queryKey: ["founding-progress", event.society_id] }),
      queryClient.invalidateQueries({ queryKey: ["founding-badge", event.society_id] }),
    ]);

  return (
    <View className="mb-6 gap-3 rounded-2xl border border-brand bg-brand-soft p-5" testID="draft-banner">
      <T variant="semibold" className="text-base">Draft: only your committee can see this.</T>
      {gated && (
        <Pressable
          onPress={() => void run(() => setSuApproved(supabase, event.id, !approved), refreshAdmin)}
          disabled={busy || admin.isPending}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: approved, disabled: busy || admin.isPending }}
          aria-checked={approved}
          className="min-h-[44px] flex-row items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5"
          testID="draft-su-approved"
        >
          <View className={`h-5 w-5 items-center justify-center rounded-md border ${approved ? "border-brand bg-brand" : "border-line bg-surface"}`}>{approved && <Icon name="checkmark" size={14} color="#fff" />}</View>
          <View className="flex-1">
            <T variant="semibold">SU approved</T>
            <Muted className="text-xs">LSESU must approve events before they&apos;re promoted.</Muted>
          </View>
        </Pressable>
      )}
      {error && <T variant="semibold" className="text-sm text-danger" testID="draft-error">{error}</T>}
      <View className="flex-row flex-wrap items-center gap-4">
        <Button onPress={() => void run(() => publishEvent(supabase, event.id), published)} disabled={busy || (gated && !approved)} testID="draft-publish">{busy ? "Saving…" : "Publish"}</Button>
        {event.society_id && (
          <Link href={`/dashboard/${event.society_id}/events/${event.id}/edit` as never} asChild>
            <Pressable testID="draft-admin-link">
              <T variant="semibold" className="text-sm text-brand">{gated ? "Event admin answers →" : "Edit event →"}</T>
            </Pressable>
          </Link>
        )}
      </View>
    </View>
  );
}

// The "take part" part of a society event. The settle-up tools (bank, your
// own result) only show if the society uses the ledger, or this event already
// does. A group chat that already exists always shows.
function SocietyPart({ event, p, userId, profile, finished, tap, busy, refresh, seatConfirmed, onConfirmed, chatId, hostIds }: { event: EventWithDetails; p: Participation; userId: string; profile: { display_name: string | null; university: string }; finished: boolean; tap: Tap; busy: boolean; refresh: () => Promise<unknown>; seatConfirmed: boolean; onConfirmed: () => void; chatId: string | null; hostIds?: Set<string> }) {
  const society = event.societies;
  const me = p.people.find((x) => x.userId === userId) ?? null;
  // Members-only events need membership; "[Uni] students" events need that uni (checked again by the database).
  const sameUni = !society || society.university === profile.university;
  const uniOnly = event.audience === "uni" && !sameUni && !p.isMember;
  const canJoin = (!event.members_only || p.isMember) && !uniOnly;

  // Members see each other's names, so ask for one before joining.
  if (!finished && canJoin && !me && !profile.display_name) return <NameForm userId={userId} onSaved={refresh} />;

  const myTable = me?.tableId ? p.tables.find((t) => t.id === me.tableId) : null;
  const started = new Date(event.starts_at).getTime() <= nowMs() || Boolean(myTable?.started_at);
  const myBankRow = me && myTable ? (p.ledger.rows.find((r) => r.user_id === me.userId && r.table_id === myTable.id) ?? null) : null;
  // Switching the ledger off mid-night doesn't take it away from an event already using it.
  const ledgerShown = hasFeature(featureSubject(society), "ledger") || p.ledger.rows.length > 0 || p.ledger.payments.length > 0 || p.tables.some((t) => t.bank_user_id);

  return (
    <>
      {finished ? (
        me && event.results_published ? <MyResults eventId={event.id} userId={userId} tables={p.tables} rows={p.ledger.rows} payments={p.ledger.payments} onChange={refresh} /> : null
      ) : uniOnly ? (
        <Card>
          <T variant="semibold">This event is for {uniShort(society?.university)} students</T>
          <Muted className="text-sm">Only students at {uniShort(society?.university)} can join.</Muted>
        </Card>
      ) : !canJoin ? (
        <Card className="flex-row flex-wrap items-center justify-between gap-3">
          <View className="flex-1">
            <T variant="semibold">Members only</T>
            <Muted className="text-sm">Join {society?.name ?? "the society"} to take part.</Muted>
          </View>
          {society && sameUni && (
            <Link href={`/s/${society.slug}` as never} asChild>
              <Button>Become a member</Button>
            </Link>
          )}
        </Card>
      ) : event.format === "tables" ? (
        <>
          {seatConfirmed && me?.tableId && me.confirmedTableId === me.tableId && (
            <T variant="semibold" className="rounded-2xl bg-ok/10 px-4 py-3 text-sm text-ok" testID="seat-confirmed">✓ Seat confirmed. See you at {myTable?.name}.</T>
          )}
          <TablesPicker event={event} tables={p.tables} people={p.people} me={me} queue={p.queue} tap={tap} busy={busy} onConfirmed={onConfirmed} hostIds={hostIds} />
        </>
      ) : event.format === "entries" ? (
        <EntryPanel event={event} people={p.people} me={me} tap={tap} busy={busy} />
      ) : (
        <GoingPanel event={event} me={me} tap={tap} busy={busy} />
      )}

      {/* The event's group chat: people going and the committee. */}
      {chatId && (
        <Link href={`/chats/${chatId}` as never} asChild>
          <Button variant="ghost" className="py-3" testID="group-chat">Open group chat</Button>
        </Link>
      )}

      {/* Just joined: a gentle nudge to finish their profile (once per run). */}
      {!finished && me?.status === "going" && userId && <PushPromptCard userId={userId} />}
      {!finished && me?.status === "going" && <CompleteProfileCard prompts={p.prompts} />}

      {/* Tables where this player is the bank: their bank screen. */}
      {ledgerShown &&
        !event.results_published &&
        p.tables
          .filter((t) => t.bank_user_id === userId)
          .map((t) => {
            const saved = p.ledger.rows.filter((r) => r.table_id === t.id);
            const seated = p.people.filter((x) => x.status === "going" && x.tableId === t.id);
            return (
              <View key={t.id} className="gap-2">
                <T variant="display" className="text-xl">You&apos;re the bank for {t.name}</T>
                <BankLedger key={saved.map((r) => `${r.id}:${r.buyin_pence}:${r.cashout_pence}:${r.paid_out}:${r.adjust_pence}`).join("|")} event={event} table={t} initialRows={bankEditorRows(saved, seated)} onSaved={refresh} />
              </View>
            );
          })}

      {/* Playing at a table with a bank (and not the bank): buy in and cash out with them. */}
      {ledgerShown && me?.status === "going" && !event.results_published && myTable?.bank_user_id && myTable.bank_user_id !== userId && <MyBankLine table={myTable} mine={myBankRow} people={p.people} />}

      {ledgerShown && me?.status === "going" && !event.results_published && started && (event.format !== "tables" || me.tableId) && !myTable?.bank_user_id && (
        <SelfReport event={event} me={me} people={p.people} rows={p.ledger.rows} payments={p.ledger.payments} onChange={refresh} />
      )}

      {/* Members see who else is coming. */}
      {p.isMember && event.format !== "tables" && p.people.some((x) => x.status === "going") && (
        <WhosComing people={p.people.filter((x) => x.status === "going")} meId={userId} numbered={event.format === "entries"} finished={finished} hostIds={hostIds} />
      )}
    </>
  );
}

type HostInfo = { host: PersonCard | null; exact: Exact; entries: Entry[]; guestCards: Map<string, PersonCard> };

// The join / guest-list part of an event a student is hosting (the guest
// side; the host's own tools arrive with the Social tab in phase 6).
function HostedPart({ event, info, userId, displayName, finished, tap, busy, onNamed, chatId }: { event: EventWithDetails; info: HostInfo | null; userId: string; displayName: string | null; finished: boolean; tap: Tap; busy: boolean; onNamed: () => Promise<unknown>; chatId: string | null }) {
  if (!info) return <Muted>Loading…</Muted>;
  const isHost = userId === event.host_user_id;
  const mine = info.entries.find((e) => e.user_id === userId) ?? null;
  const going = info.entries.filter((e) => e.status === "going");
  const waiting = info.entries.filter((e) => e.status === "waitlist");
  const requests = info.entries.filter((e) => e.status === "requested");
  const full = event.capacity !== null && event.going_count >= event.capacity;
  const canSeeGuests = isHost || mine?.status === "going";
  const hostName = info.host?.name ?? "The host";
  return (
    <>
      {isHost ? (
        <Card className="gap-3">
          <T variant="display-bold" className="text-lg">You&apos;re hosting</T>
          <Muted className="text-sm">
            {event.going_count} going{event.capacity ? ` of ${event.capacity}` : ""}{requests.length ? ` · ${requests.length} waiting for your answer` : ""}{event.visibility === "friends" ? " · Friends only" : " · On the public map"}
          </Muted>
          <Muted className="text-sm">Editing and answering requests are on the website for now.</Muted>
          {chatId && (
            <Link href={`/chats/${chatId}` as never} asChild>
              <Button variant="ghost" className="self-start py-2" testID="group-chat">Open group chat</Button>
            </Link>
          )}
          <Button variant="ghost" className="self-start py-2" onPress={() => Linking.openURL(`${SITE_URL}/e/${event.id}`)}>Manage on the website</Button>
        </Card>
      ) : finished ? null : !displayName && !mine ? (
        <NameForm userId={userId} onSaved={onNamed} />
      ) : (
        <HostedJoinCard event={event} mine={(mine?.status ?? null) as HostedStatus} hostName={hostName} full={full} tap={tap} busy={busy} chat={chatId ? <Link href={`/chats/${chatId}` as never} asChild><Pressable testID="group-chat"><T variant="semibold" className="text-sm text-brand">Group chat</T></Pressable></Link> : undefined} />
      )}

      {canSeeGuests && (
        <PeopleSection title={`Going (${going.length + 1})`}>
          {info.host && <PersonRow id={info.host.id} name={info.host.name} avatarUrl={info.host.avatar_url} country={info.host.country} detail="Host" first />}
          {going.map((e) => {
            const c = info.guestCards.get(e.user_id);
            return <PersonRow key={e.user_id} id={e.user_id} name={c?.name ?? "Member"} avatarUrl={c?.avatar_url} country={c?.country} detail={c?.course} />;
          })}
        </PeopleSection>
      )}
      {isHost && waiting.length > 0 && (
        <PeopleSection title={`Waiting list (${waiting.length})`}>
          {waiting.map((e, i) => {
            const c = info.guestCards.get(e.user_id);
            return <PersonRow key={e.user_id} id={e.user_id} name={c?.name ?? "Member"} avatarUrl={c?.avatar_url} country={c?.country} detail={c?.course} first={i === 0} />;
          })}
        </PeopleSection>
      )}
      {!canSeeGuests && going.length === 0 && event.going_count > 0 && <Muted className="text-sm">{event.going_count} going. You&apos;ll see who once you&apos;re in.</Muted>}
    </>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10" keyboardShouldPersistTaps="handled">
        <BackButton fallback="/(tabs)/map" className="mb-4" />
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function Badge({ children, className = "bg-brand-soft", textClassName = "text-brand" }: { children: string; className?: string; textClassName?: string }) {
  return (
    <View className={`rounded-full px-2.5 py-0.5 ${className}`}>
      <T variant="bold" className={`text-sm ${textClassName}`}>{children}</T>
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Muted className="text-sm font-sans-semibold">{label}</Muted>
      <T variant="semibold">{children}</T>
    </View>
  );
}
