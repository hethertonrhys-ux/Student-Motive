import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { categoryInfo, formatCost, formatWhen, loadSocialEvent, nowMs, openHostChat, removeSocialGuest, reportSocialEvent, respondToRequest, spacesLeft, timeFormat } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { Avatar } from "@/components/avatar";
import { CompleteProfileCard } from "@/components/complete-profile-card";
import { PushPromptCard } from "@/components/push-prompt";
import { LinkButton, PeopleSection, PersonRow, type Tap } from "@/components/event/panels";
import { ShareButton } from "@/components/share-button";
import { Attendees } from "@/components/social/attendees";
import { Pill } from "@/components/social/event-card";
import { JoinPanel } from "@/components/social/join-panel";
import { Button, Card, Heading, Input, Muted, T } from "@/components/ui";
import { SITE_URL } from "@/lib/site";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// A student-hosted Social event: the details, who's going, join / request,
// and the host's tools (requests, the guest list, edit, cancel).
export default function SocialEventScreen() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const { session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const myId = session?.user.id ?? null;
  const page = useQuery({ queryKey: ["social-event", id, myId], queryFn: () => loadSocialEvent(supabase, id, myId), enabled: !!id });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["social-event", id] }), queryClient.invalidateQueries({ queryKey: ["social-tab"] }), queryClient.invalidateQueries({ queryKey: ["map-events"] }), queryClient.invalidateQueries({ queryKey: ["feed"] })]);
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

  if (page.isPending) return <Screen><Muted>Loading…</Muted></Screen>;
  const p = page.data;
  if (!p) {
    return (
      <Screen>
        <Heading>Event not found</Heading>
        <Muted className="mt-2">It may have been removed.</Muted>
      </Screen>
    );
  }
  const { event, members, address, chatId, myPrompts, cards } = p;
  const isHost = myId === event.host_id;
  const host = cards.get(event.host_id);
  const mine = members.find((m) => m.user_id === myId)?.status ?? null;
  const going = members.filter((m) => m.status === "going");
  const requests = members.filter((m) => m.status === "pending");
  const left = spacesLeft(event);
  const finished = new Date(event.ends_at).getTime() < nowMs();
  const cat = categoryInfo(event.category);
  const cost = formatCost(event.cost_pence);
  const pin = address?.lat != null && address?.lng != null ? address : null;

  async function messageHost() {
    const thread = await openHostChat(supabase, event.id);
    if (thread) router.push(`/chats/${thread}` as never);
  }

  return (
    <Screen>
      <BackButton fallback={"/(tabs)/social"} />
      <View className="mt-4 flex-row flex-wrap items-center gap-2">
        <Pill>{cat.label}</Pill>
        <Pill box={event.is_private ? "bg-ink" : "bg-brand-soft"} text={event.is_private ? "text-bg" : "text-brand"}>{event.is_private ? "Private" : "Open"}</Pill>
        {event.friends_only && <Pill>Friends only</Pill>}
        {event.is_cancelled && <Pill box="bg-danger/10" text="text-danger">Cancelled</Pill>}
      </View>
      <Heading className="mt-3 leading-tight">{event.title}</Heading>

      {host && (
        <View className="mt-3 flex-row flex-wrap items-center gap-3">
          <Link href={`/u/${host.id}` as never} asChild>
            <Pressable className="flex-row items-center gap-2">
              <Avatar name={host.name} url={host.avatar_url} size={28} ring />
              <T variant="semibold">Hosted by <T variant="semibold" className="text-brand">{host.name}</T></T>
            </Pressable>
          </Link>
          {/* Anyone can ask the host something, friends or not. */}
          {myId && !isHost && (
            <Pressable onPress={() => void messageHost()} className="rounded-full border border-line bg-surface px-3 py-1" testID="message-host">
              <T variant="semibold" className="text-sm text-brand">Message host</T>
            </Pressable>
          )}
        </View>
      )}
      {created && isHost && <T variant="semibold" className="mt-4 rounded-2xl bg-ok/10 px-4 py-3 text-sm text-ok" testID="created">✓ Your event is live. Share the link to invite people.</T>}

      <Card className="mt-5 gap-4">
        <Row label="When">{formatWhen(event.starts_at)}–{timeFormat.format(new Date(event.ends_at))}</Row>
        <View>
          <Muted className="text-sm font-sans-semibold">Where</Muted>
          <T variant="semibold">{event.area}</T>
          {address?.address ? <T className="text-sm" testID="exact-address">{address.address}</T> : !isHost && <Muted className="text-sm">The exact spot is shared with people going.</Muted>}
          {pin && (
            <Pressable onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${pin.lat},${pin.lng}`)}>
              <T variant="semibold" className="text-sm text-brand">Open in Maps →</T>
            </Pressable>
          )}
        </View>
        {cost && <Row label="Cost">{cost === "Free" ? "Free" : `${cost} per person`}</Row>}
        <View>
          <Muted className="text-sm font-sans-semibold">Spaces</Muted>
          <T variant="semibold" className={left === 0 ? "text-danger" : ""} testID="spaces">{left === 0 ? `Full (${event.spaces} of ${event.spaces})` : `${left} of ${event.spaces} spaces left`}</T>
        </View>
      </Card>

      <Attendees
        host={host ? { id: host.id, name: host.name, avatar_url: host.avatar_url } : null}
        people={isHost || mine === "going" ? going.map((g) => ({ id: g.user_id, name: cards.get(g.user_id)?.name ?? "Member", avatar_url: cards.get(g.user_id)?.avatar_url ?? null })) : null}
        guests={event.going_count}
      />

      <View className="mt-5 gap-3">
        <JoinPanel eventId={event.id} isPrivate={event.is_private} cancelled={event.is_cancelled} loggedIn={!!myId} isHost={isHost} myId={myId} mine={mine} left={left} finished={finished} hostName={host?.name ?? "The host"} suggestPrompt={myPrompts === 0} tap={tap} busy={busy} />
        {error && <T variant="semibold" className="text-sm text-danger" testID="action-error">{error}</T>}
        {myId && !isHost && (mine === "going" || mine === "pending") && <PushPromptCard userId={myId} />}
        {myId && !isHost && (mine === "going" || mine === "pending") && <CompleteProfileCard prompts={myPrompts ?? 0} />}
        {chatId && (isHost || mine === "going") && (
          <Link href={`/chats/${chatId}` as never} asChild>
            <Button variant="ghost" className="py-3" testID="group-chat">Open group chat</Button>
          </Link>
        )}
      </View>

      {event.description && <T className="mt-6 text-lg leading-7">{event.description}</T>}

      {/* Host: requests to approve */}
      {isHost && requests.length > 0 && !event.is_cancelled && (
        <View className="mt-8">
          <PeopleSection title={`Requests (${requests.length})`}>
            {requests.map((r, i) => {
              const c = cards.get(r.user_id);
              return (
                <PersonRow key={r.user_id} id={r.user_id} name={c?.name ?? "Member"} avatarUrl={c?.avatar_url} detail={c?.course} first={i === 0}>
                  <View className="flex-row gap-2">
                    <Button className="px-3 py-1.5" onPress={() => void tap(() => respondToRequest(supabase, event.id, r.user_id, true))} disabled={busy} testID={`approve-${r.user_id}`}>Approve</Button>
                    <Button variant="ghost" className="px-3 py-1.5" onPress={() => void tap(() => respondToRequest(supabase, event.id, r.user_id, false))} disabled={busy} testID={`decline-${r.user_id}`}>Decline</Button>
                  </View>
                </PersonRow>
              );
            })}
          </PeopleSection>
          <Muted className="mt-1 text-sm">Tap someone to see their profile.</Muted>
        </View>
      )}

      {/* The host's guest list, with Remove (everyone else uses the faces above) */}
      {isHost && going.length > 0 && (
        <View className="mt-8">
          <PeopleSection title={`Going (${going.length + 1})`}>
            {host && <PersonRow id={host.id} name={host.name} avatarUrl={host.avatar_url} detail="Host" first />}
            {going.map((g) => {
              const c = cards.get(g.user_id);
              return (
                <PersonRow key={g.user_id} id={g.user_id} name={c?.name ?? "Member"} avatarUrl={c?.avatar_url}>
                  {!finished && <LinkButton onPress={() => void tap(() => removeSocialGuest(supabase, event.id, g.user_id))} confirmText={`Remove ${c?.name ?? "them"} from this event?`} disabled={busy} testID={`remove-${g.user_id}`}>Remove</LinkButton>}
                </PersonRow>
              );
            })}
          </PeopleSection>
        </View>
      )}

      <View className="mt-8 flex-row flex-wrap items-center gap-4">
        <ShareButton url={`${SITE_URL}/social/${id}`} title={event.title} />
        {myId && !isHost && <ReportLink id={id} />}
      </View>
    </Screen>
  );
}

// "Report this event": say why, and the Function team takes a look.
function ReportLink({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (done) return <Muted className="text-sm">Thanks. The Function team will take a look.</Muted>;
  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} testID="report">
        <T variant="semibold" className="text-sm text-muted">Report this event</T>
      </Pressable>
    );
  }
  return (
    <View className="w-full gap-2">
      <Input value={reason} onChangeText={setReason} placeholder="Why are you reporting this event?" maxLength={200} testID="report-reason" />
      <View className="flex-row gap-2">
        <Button
          className="py-2"
          onPress={async () => {
            const r = await reportSocialEvent(supabase, id, reason);
            if (r.error) setError(r.error);
            else setDone(true);
          }}
          testID="send-report"
        >
          Send report
        </Button>
        <Button variant="ghost" className="py-2" onPress={() => setOpen(false)}>Cancel</Button>
      </View>
      {error && <T variant="semibold" className="text-sm text-danger">{error}</T>}
    </View>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-8" keyboardShouldPersistTaps="handled">{children}</ScrollView>
    </SafeAreaView>
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
