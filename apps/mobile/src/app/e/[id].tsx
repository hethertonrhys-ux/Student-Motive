import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  audienceLabel,
  categoryLabel,
  formatCost,
  formatEventTime,
  getCards,
  getEventPeople,
  hasEnded,
  isLive,
  loadEvent,
  uniShort,
  type EventWithDetails,
  type Person,
} from "@function/shared";
import { ShareButton } from "@/components/share-button";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? "https://studentfunction.com";

// A society event (or a student-hosted one): the details, who can come,
// and the "I'm going" button. Sign-up lists, tables and results (phase 5)
// are shown as counts for now.
export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  const event = useQuery({ queryKey: ["event", id], queryFn: () => loadEvent(supabase, id), enabled: !!id });
  const extras = useQuery({
    queryKey: ["event-extras", id, session?.user.id ?? null],
    enabled: !!event.data,
    queryFn: async () => {
      const ev = event.data!;
      const [people, member, host] = await Promise.all([
        session ? getEventPeople(supabase, ev.id) : Promise.resolve({ people: [] as Person[], tables: [] }),
        session && ev.society_id ? supabase.rpc("is_society_member", { sid: ev.society_id }).then((r) => r.data === true) : Promise.resolve(false),
        ev.host_user_id ? getCards(supabase, [ev.host_user_id]).then((c) => c.get(ev.host_user_id!) ?? null) : Promise.resolve(null),
      ]);
      return { people: people.people, isMember: member, host };
    },
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["event", id] }), queryClient.invalidateQueries({ queryKey: ["event-extras", id] }), queryClient.invalidateQueries({ queryKey: ["feed"] })]);
  const join = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("join_event", { eid: id, tid: null });
      if (error) throw new Error(friendly(error.message));
    },
    onSuccess: refresh,
    onError: (e: Error) => setActionError(e.message),
  });
  const leave = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("leave_event", { eid: id });
      if (error) throw new Error(friendly(error.message));
    },
    onSuccess: refresh,
    onError: (e: Error) => setActionError(e.message),
  });

  if (event.isPending) return <Screen><Muted>Loading…</Muted></Screen>;
  const ev = event.data;
  if (!ev) {
    return (
      <Screen>
        <Heading>Event not found</Heading>
        <Muted className="mt-2">It may have been removed, or it&apos;s not open to you.</Muted>
      </Screen>
    );
  }

  const hosted = Boolean(ev.host_user_id);
  const earlyStart = (ev.event_tables ?? []).some((t) => t.started_at) && !hasEnded(ev.ends_at);
  const live = !ev.is_cancelled && (isLive(ev.starts_at, ev.ends_at) || earlyStart);
  const finished = hasEnded(ev.ends_at);
  const cost = formatCost(ev.cost_pence);
  const pin = ev.venues ? { lat: ev.venues.lat, lng: ev.venues.lng } : ev.lat != null && ev.lng != null ? { lat: ev.lat, lng: ev.lng } : null;
  const mapsUrl = pin && !hosted ? `https://www.google.com/maps/search/?api=1&query=${pin.lat},${pin.lng}` : null;
  const me = extras.data?.people.find((p) => p.userId === session?.user.id) ?? null;
  // Members-only events need membership; "[Uni] students" events need that uni (the database checks too).
  const sameUni = !ev.societies || !profile || ev.societies.university === profile.university;
  const uniOnly = ev.audience === "uni" && !sameUni && !extras.data?.isMember;
  const canJoin = (!ev.members_only || extras.data?.isMember === true) && !uniOnly;

  return (
    <Screen>
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
      {extras.data?.host && <Muted className="mt-2">Hosted by <T variant="semibold" className="text-brand">{extras.data.host.name}</T></Muted>}

      <Card className="mt-6 gap-4">
        <Row label="When">{formatEventTime(ev.starts_at, ev.ends_at)}</Row>
        {(ev.venues || pin) && (
          <View>
            <Muted className="text-sm font-sans-semibold">Where</Muted>
            <T variant="semibold">{ev.venues ? ev.venues.name : ev.location_note || "See the map"}{ev.venues && ev.location_note ? ` · ${ev.location_note}` : ""}</T>
            {ev.venues?.address && <Muted className="text-sm">{ev.venues.address}</Muted>}
            {hosted && <Muted className="text-sm">The exact address is shared with people going.</Muted>}
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

      {ev.description && <T className="mt-6 text-lg leading-7">{ev.description}</T>}

      {!ev.is_cancelled && !finished && (
        <View className="mt-6">
          {!session ? (
            <Card className="flex-row flex-wrap items-center justify-between gap-3">
              <T variant="semibold" className="flex-1">{ev.format === "tables" ? "Log in to pick your table." : ev.format === "entries" ? "Log in to enter." : "Log in to say you're going."}</T>
              <Link href={{ pathname: "/login", params: { next: `/e/${ev.id}` } }} asChild>
                <Button>Log in</Button>
              </Link>
            </Card>
          ) : uniOnly ? (
            <Card>
              <T variant="semibold">This event is for {uniShort(ev.societies?.university)} students</T>
              <Muted className="text-sm">Only students at {uniShort(ev.societies?.university)} can join.</Muted>
            </Card>
          ) : !canJoin ? (
            <Card className="flex-row flex-wrap items-center justify-between gap-3">
              <View className="flex-1">
                <T variant="semibold">Members only</T>
                <Muted className="text-sm">Join {ev.societies?.name ?? "the society"} to take part.</Muted>
              </View>
              {ev.societies && sameUni && (
                <Link href={`/s/${ev.societies.slug}` as never} asChild>
                  <Button>Become a member</Button>
                </Link>
              )}
            </Card>
          ) : ev.format !== "standard" ? (
            <Card>
              <T variant="semibold">{ev.format === "tables" ? "Tables" : "Sign-up list"}</T>
              <Muted className="text-sm">
                {me ? (me.status === "waitlist" ? "You're on the waiting list." : "You're in.") : "Picking tables and entering arrives in phase 5. For now, use the website."}
              </Muted>
            </Card>
          ) : (
            <Card className="flex-row flex-wrap items-center justify-between gap-3">
              {me ? (
                <>
                  <T variant="semibold"><T className="text-ok">✓</T> You&apos;re going</T>
                  <Pressable onPress={() => leave.mutate()} disabled={leave.isPending} testID="leave">
                    <T variant="semibold" className="text-sm text-muted">Can&apos;t make it</T>
                  </Pressable>
                </>
              ) : (
                <>
                  <T variant="semibold">Coming?</T>
                  <Button onPress={() => join.mutate()} disabled={join.isPending || extras.isPending} testID="join">I&apos;m going</Button>
                </>
              )}
            </Card>
          )}
          {actionError && <T variant="semibold" className="mt-2 text-sm text-danger">{actionError}</T>}
        </View>
      )}

      <View className="mt-8 flex-row flex-wrap gap-3">
        {ev.ticket_url && <Button onPress={() => Linking.openURL(ev.ticket_url!)}>Tickets / sign up</Button>}
        <ShareButton url={`${SITE_URL}/e/${ev.id}`} title={ev.title} />
      </View>
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10">{children}</ScrollView>
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

// The database's own messages are readable; just tidy the prefix it adds.
function friendly(message: string) {
  return message.replace(/^.*?:\s*/, "").trim() || "Something went wrong. Please try again.";
}
