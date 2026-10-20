import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { categoryLabel, formatCost, formatEventTime, foundingBadgeActive, initialOf, isLive, leaveSociety, loadMembership, loadSociety, requestToJoin, uniShort, type Membership, type Society } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { Icon } from "@/components/icon";
import { Button, Card, Heading, Input, Label, Muted, T } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// A society's page: who they are, join / leave, and their upcoming events.
export default function SocietyScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { session } = useSession();
  const { profile } = useProfile();
  const page = useQuery({ queryKey: ["society", slug], queryFn: () => loadSociety(supabase, slug), enabled: !!slug });
  const society = page.data?.society;
  const membership = useQuery({
    queryKey: ["membership", society?.id ?? null, session?.user.id ?? null],
    queryFn: () => loadMembership(supabase, society!.id, session!.user.id),
    enabled: !!society && !!session,
  });
  // The Founding Society badge: only asked for societies the Function team
  // has marked Founding (every other society never shows it).
  const badge = useQuery({ queryKey: ["founding-badge", society?.id ?? null], queryFn: () => foundingBadgeActive(supabase, society!.id), enabled: society?.is_founding === true });

  if (page.isPending) return <Screen><Muted>Loading…</Muted></Screen>;
  if (!page.data || !society) {
    return (
      <Screen>
        <Heading>Society not found</Heading>
        <Muted className="mt-2">It may have been removed.</Muted>
      </Screen>
    );
  }
  const { events, claimed } = page.data;

  return (
    <Screen>
      <View className="flex-row items-center gap-4">
        {society.logo_url ? (
          <Image source={{ uri: society.logo_url }} style={{ width: 80, height: 80, borderRadius: 16 }} contentFit="cover" />
        ) : (
          <View className="h-20 w-20 items-center justify-center rounded-2xl bg-brand-soft">
            <T variant="display-bold" className="text-3xl text-brand">{initialOf(society.name)}</T>
          </View>
        )}
        <View className="flex-1">
          <Heading>{society.name}</Heading>
          <View className="mt-1 flex-row flex-wrap items-center gap-3">
            <T variant="semibold" className="text-sm text-muted">{uniShort(society.university)}</T>
            {badge.data === true && (
              <View className="flex-row items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5" testID="founding-badge">
                <Icon name="ribbon" size={12} color="#DA291C" />
                <T variant="bold" className="text-xs text-brand">Founding Society</T>
              </View>
            )}
            {claimed === false && (
              <View className="rounded-full border border-line px-2 py-0.5" testID="unclaimed">
                <T variant="bold" className="text-xs text-muted">Unclaimed</T>
              </View>
            )}
            {society.instagram && (
              <Pressable onPress={() => Linking.openURL(`https://instagram.com/${society.instagram}`)}>
                <T variant="semibold" className="text-sm text-brand">@{society.instagram}</T>
              </Pressable>
            )}
            {society.website && (
              <Pressable onPress={() => Linking.openURL(society.website!)}>
                <T variant="semibold" className="text-sm text-brand">Website</T>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {society.description && <T className="mt-6 text-lg leading-7">{society.description}</T>}

      <MembershipCard society={society} membership={membership.data ?? null} loading={!!session && membership.isPending} />

      {/* Nobody runs this page yet (it came from the SU directory): its committee can ask to take it over. */}
      {claimed === false && (!profile || profile.university === society.university) && (
        <View className="mt-3 flex-row flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-line px-4 py-3">
          <Muted className="text-sm">Is this your society?</Muted>
          <Link href={{ pathname: "/dashboard/claim", params: { society: society.id } } as never} asChild>
            <Pressable testID="claim">
              <T variant="semibold" className="text-sm text-brand">Claim this page →</T>
            </Pressable>
          </Link>
        </View>
      )}

      <T variant="display" className="mt-10 text-xl">Upcoming events</T>
      {events.length === 0 ? (
        <Muted className="mt-3">Nothing coming up yet. Check back soon.</Muted>
      ) : (
        <View className="mt-3 gap-3">
          {events.map((event) => {
            const cost = formatCost(event.cost_pence);
            return (
              <Link key={event.id} href={`/e/${event.id}` as never} asChild>
                <Pressable testID={`event-${event.id}`}>
                  <Card className="flex-row items-center justify-between gap-4">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        {isLive(event.starts_at, event.ends_at) && (
                          <View className="rounded-full bg-live px-2 py-0.5">
                            <T className="text-xs text-white">LIVE</T>
                          </View>
                        )}
                        <T variant="display-bold" className="flex-1 text-lg" numberOfLines={2}>{event.title}</T>
                      </View>
                      <Muted className="text-sm">{formatEventTime(event.starts_at, event.ends_at)} · {categoryLabel(event.category)}{cost ? ` · ${cost}` : ""}</Muted>
                    </View>
                    <T variant="semibold" className="text-sm text-muted">{event.going_count} going</T>
                  </Card>
                </Pressable>
              </Link>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

function MembershipCard({ society, membership, loading }: { society: Society; membership: Membership | null; loading: boolean }) {
  const { session } = useSession();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const uni = uniShort(society.university);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What you tapped shows straight away; the request goes in the background.
  const [optimistic, setOptimistic] = useState<"pending" | "left" | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["membership", society.id] }).then(() => Promise.all([queryClient.invalidateQueries({ queryKey: ["societies-tab"] }), queryClient.invalidateQueries({ queryKey: ["filter-context"] }), queryClient.invalidateQueries({ queryKey: ["recommended"] })]));
  const join = useMutation({
    mutationFn: async (yourName: string) => {
      const result = await requestToJoin(supabase, society.id, yourName);
      if (result.error) throw new Error(result.error);
    },
    onMutate: () => {
      setError(null);
      setOptimistic("pending");
    },
    onError: (e: Error) => {
      setOptimistic(null);
      setError(e.message);
    },
    onSuccess: refresh,
  });
  const leave = useMutation({
    mutationFn: () => leaveSociety(supabase, society.id, session?.user.id ?? ""),
    onMutate: () => setOptimistic("left"),
    onSuccess: refresh,
    onError: () => setOptimistic(null),
  });

  if (!session) {
    return (
      <Card className="mt-6 flex-row flex-wrap items-center justify-between gap-3">
        <T variant="semibold" className="flex-1">{uni} students can join to enter events and pick their table.</T>
        <Link href={{ pathname: "/login", params: { next: `/s/${society.slug}` } }} asChild>
          <Button>Log in to join</Button>
        </Link>
      </Card>
    );
  }
  if (loading || !membership || !profile) return <Card className="mt-6"><Muted>Loading…</Muted></Card>;

  if (membership.isAdmin) {
    return (
      <Card className="mt-6 flex-row flex-wrap items-center justify-between gap-3">
        <T variant="semibold">You run this society.</T>
        <View className="flex-row flex-wrap gap-2">
          <Link href={`/hub/${society.id}` as never} asChild>
            <Button testID="open-hub">Open Society Hub</Button>
          </Link>
          <Link href={`/dashboard/${society.id}` as never} asChild>
            <Button variant="ghost" testID="open-dashboard">Open dashboard</Button>
          </Link>
        </View>
      </Card>
    );
  }
  const status = optimistic === "left" ? null : optimistic === "pending" ? "pending" : membership.status;

  if (status === "approved") {
    return (
      <Card className="mt-6 gap-3" testID="member">
        <View className="flex-row flex-wrap items-center justify-between gap-3">
          <T variant="semibold"><T className="text-ok">✓</T> You&apos;re a member of {society.name}</T>
          <Pressable onPress={() => leave.mutate()} disabled={leave.isPending} testID="leave">
            <T variant="semibold" className="text-sm text-muted">Leave</T>
          </Pressable>
        </View>
      </Card>
    );
  }
  if (status === "pending") {
    return (
      <Card className="mt-6" testID="request-sent">
        <T variant="semibold">Request sent</T>
        <Muted className="text-sm">The committee will approve you once they&apos;ve checked your membership.</Muted>
      </Card>
    );
  }
  // Societies are for their own uni's students: no join button for anyone else (the database refuses it too).
  if (profile.university !== society.university) {
    return (
      <Card className="mt-6" testID="other-uni">
        <T variant="semibold">This society is for {uni} students.</T>
        <Muted className="text-sm">You can still go to its events that are open to all London students.</Muted>
      </Card>
    );
  }
  const yourName = name ?? profile.display_name ?? "";
  return (
    <Card className="mt-6 gap-2" testID="join-card">
      <T variant="semibold">Are you a member of {society.name}?</T>
      <Muted className="text-sm">Join to enter events and pick your table. The committee approves members.</Muted>
      <View className="mt-1">
        <Label>Your name</Label>
        <Input value={yourName} onChangeText={setName} placeholder="First and last name" maxLength={60} testID="join-name" />
      </View>
      <Button onPress={() => join.mutate(yourName)} disabled={join.isPending} className="mt-1 self-start" testID="join-society">{join.isPending ? "Sending…" : "Join society"}</Button>
      {error && <T variant="semibold" className="text-sm text-danger">{error}</T>}
    </Card>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10" keyboardShouldPersistTaps="handled">
        <BackButton fallback="/(tabs)/societies" className="mb-4" />
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
