import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Pressable, RefreshControl, View } from "react-native";
import { formatEventTime, loadSocietiesTab } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { Button, Card, Heading, Muted, Screen, T } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { usePullToRefresh, useRefetchOnFocus } from "@/lib/use-refetch-on-focus";
import { useSession } from "@/providers/session";

// Societies → Your upcoming society events: the ones you're going to, have
// asked to join or are on the waiting list for, soonest first.
export default function MySocietyEventsScreen() {
  const { session } = useSession();
  const { profile } = useProfile();
  const me = profile ? { id: profile.id, university: profile.university } : null;
  // The same data as the Societies tab, so it's usually already loaded.
  const tab = useQuery({ queryKey: ["societies-tab", me?.id ?? null, me?.university ?? null], queryFn: () => loadSocietiesTab(supabase, me), enabled: !!me });
  useRefetchOnFocus(tab);
  const pull = usePullToRefresh(tab.refetch);
  const upcoming = tab.data?.upcoming ?? [];

  return (
    <Screen refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={() => void pull.onRefresh()} />}>
      <BackButton fallback="/(tabs)/societies" label="Back to Societies" />
      <Heading className="mt-3">Your upcoming society events</Heading>
      <Muted className="mt-1 text-sm">Events you&apos;re going to, have asked to join or are on the waiting list for.</Muted>
      {!session ? (
        <Card className="mt-6"><Muted>Log in to see your events.</Muted></Card>
      ) : !me || tab.isPending ? (
        <Muted className="mt-6">Loading…</Muted>
      ) : tab.isError ? (
        <T variant="semibold" className="mt-6 text-sm text-danger">Couldn&apos;t load your events. Pull down to try again.</T>
      ) : upcoming.length === 0 ? (
        <Card className="mt-6 items-start gap-3" testID="no-upcoming">
          <Muted>Nothing coming up yet. Find something you like and join it.</Muted>
          <Link href={"/society-events" as never} asChild>
            <Button variant="ghost">See events coming up</Button>
          </Link>
        </Card>
      ) : (
        <View className="mt-5 gap-2" testID="upcoming-list">
          {upcoming.map(({ status, event: e }) => (
            <Link key={e.id} href={`/e/${e.id}` as never} asChild>
              <Pressable>
                <Card className="flex-row items-center justify-between gap-3 py-3">
                  <View className="min-w-0 flex-1">
                    <T variant="bold" numberOfLines={1}>{e.title}</T>
                    <Muted className="text-sm">{formatEventTime(e.starts_at, e.ends_at)}{e.societies ? ` · ${e.societies.name}` : ""}</Muted>
                  </View>
                  <View className={`rounded-full px-2.5 py-0.5 ${status === "going" ? "bg-ok/10" : "bg-brand-soft"}`}>
                    <T variant="bold" className={`text-xs ${status === "going" ? "text-ok" : "text-brand"}`}>{status === "going" ? "Going" : status === "requested" ? "Requested" : "Waiting list"}</T>
                  </View>
                </Card>
              </Pressable>
            </Link>
          ))}
        </View>
      )}
    </Screen>
  );
}
