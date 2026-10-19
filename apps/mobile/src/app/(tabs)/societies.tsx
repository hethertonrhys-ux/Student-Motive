import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatEventTime, loadSocietiesTab, uniShort } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { PersonalFilterBoxes } from "@/components/personal-filters";
import { ListModeSwitch, SocietyEventsForYou, type ListMode } from "@/components/recommended-events";
import { SocietySearch } from "@/components/society-search";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { useFilterContext } from "@/lib/filter-context";
import { usePersonalFilters } from "@/lib/personal-filters";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { usePullToRefresh, useRefetchOnFocus } from "@/lib/use-refetch-on-focus";
import { useSession } from "@/providers/session";

// The Societies tab: find societies, your memberships, the ones you run and
// your upcoming society events.
export default function SocietiesScreen() {
  const { session } = useSession();
  const { profile } = useProfile();
  const me = profile ? { id: profile.id, university: profile.university } : null;
  const tab = useQuery({ queryKey: ["societies-tab", me?.id ?? null, me?.university ?? null], queryFn: () => loadSocietiesTab(supabase, me), enabled: !session || !!profile });
  useRefetchOnFocus(tab);
  const queryClient = useQueryClient();
  const pull = usePullToRefresh(() => Promise.all([tab.refetch(), queryClient.invalidateQueries({ queryKey: ["filter-context"] }), queryClient.invalidateQueries({ queryKey: ["recommended", "society"] })]));
  const data = tab.data;
  const myUni = profile?.university;
  const [mode, setMode] = useState<ListMode>("all");
  const { context: who, ready: whoReady } = useFilterContext();
  const [personal, setPersonal] = usePersonalFilters();

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-8" keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={() => void pull.onRefresh()} />}>
        <Heading>Societies</Heading>
        <Muted className="mt-1 text-sm">{myUni ? `Every ${uniShort(myUni)} society, hall and more in one place.` : "Every society, hall and more across London's unis."}</Muted>

        <SocietySearch societies={data?.all ?? []} myUni={myUni} relations={data?.relations} />
        {me && (
          <View className="mt-8">
            <T variant="display" className="text-xl">Events coming up</T>
            <View className="mt-3">
              <ListModeSwitch mode={mode} onChange={setMode} allLabel="All events" testID="societies-mode" />
            </View>
            <View className="mt-3 rounded-2xl border border-line bg-surface px-2 py-1">
              <PersonalFilterBoxes filters={personal} onChange={setPersonal} compact testID="recommended-personal" />
            </View>
            <SocietyEventsForYou me={{ id: me.id, university: me.university }} who={who} ready={whoReady} personal={personal} mode={mode} />
          </View>
        )}

        {!!data?.upcoming.length && (
          <View className="mt-8">
            <T variant="display" className="text-xl">Your upcoming events</T>
            <View className="mt-3 gap-2">
              {data.upcoming.map(({ status, event: e }) => (
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
          </View>
        )}

        {!!data?.memberships.length && (
          <View className="mt-8">
            <T variant="display" className="text-xl">Your societies</T>
            <View className="mt-3 flex-row flex-wrap gap-2" testID="my-societies">
              {data.memberships.map(({ status, society: s }) => (
                <Link key={s.id} href={`/s/${s.slug}` as never} asChild>
                  <Pressable className="flex-row items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3.5">
                    <Avatar name={s.name} url={s.logo_url} size={26} />
                    <T variant="semibold">{s.name}</T>
                    {status === "pending" && <T variant="bold" className="text-xs text-muted">· awaiting approval</T>}
                  </Pressable>
                </Link>
              ))}
            </View>
          </View>
        )}

        {session && profile && (
          <View className="mt-8">
            <T variant="display" className="text-xl">Societies you run</T>
            <View className="mt-3 gap-3">
              {data?.runs.map((s) => (
                <Link key={s.id} href={`/dashboard/${s.id}` as never} asChild>
                <Pressable testID={`manage-${s.id}`}>
                  <Card className="flex-row items-center justify-between gap-4">
                    <View className="flex-1 flex-row items-center gap-3">
                      <Avatar name={s.name} url={s.logo_url} size={36} />
                      <T variant="display-bold" className="flex-1 text-lg" numberOfLines={1}>{s.name}</T>
                    </View>
                    <T variant="semibold" className="text-sm text-brand">Manage →</T>
                  </Card>
                </Pressable>
                </Link>
              ))}
              {data && data.runs.length === 0 && (
                <Card>
                  <Muted>On a committee? Ask to manage your society&apos;s page and we&apos;ll approve it once we&apos;ve checked.</Muted>
                </Card>
              )}
            </View>
            <View className="mt-4 flex-row flex-wrap gap-2">
              <Link href={"/dashboard/claim" as never} asChild>
                <Button variant="ghost">+ Request to manage a society</Button>
              </Link>
              <Link href={"/dashboard" as never} asChild>
                <Button variant="ghost" testID="dashboard-link">Society dashboard</Button>
              </Link>
            </View>
          </View>
        )}

        {tab.isError && <T variant="semibold" className="mt-6 text-sm text-danger">Couldn&apos;t load your societies. Pull down to try again.</T>}

        {!session && (
          <Card className="mt-8 flex-row flex-wrap items-center justify-between gap-3">
            <T variant="semibold">Log in to see your societies.</T>
            <Link href={{ pathname: "/login", params: { next: "/societies" } }} asChild>
              <Button>Log in</Button>
            </Link>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
