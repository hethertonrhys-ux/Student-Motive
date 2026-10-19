import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { loadSocialTab, matchesDiscover, nowMs, type DiscoverFilters, type SocialTab } from "@function/shared";
import { SocialEventCard } from "@/components/social/event-card";
import { EMPTY_FILTERS, Filters } from "@/components/social/filters";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// The Social tab: plans hosted by students. Discover, what you're hosting
// and what you're going to.
export default function SocialScreen() {
  const { session } = useSession();
  const myId = session?.user.id ?? null;
  const [tab, setTab] = useState<SocialTab>("discover");
  const [filters, setFilters] = useState<DiscoverFilters>(EMPTY_FILTERS);
  const data = useQuery({ queryKey: ["social-tab", tab, myId], queryFn: () => loadSocialTab(supabase, myId, tab), refetchInterval: 60_000 });
  const d = data.data;
  const now = nowMs();
  const filtered = Boolean(filters.categories.length || filters.date || filters.type || filters.available || filters.q.trim());
  const shown = useMemo(() => (d && tab === "discover" ? d.events.filter((e) => matchesDiscover(e, filters, now)) : (d?.events ?? [])), [d, tab, filters, now]);
  const hostingBadge = d?.hostingBadge ?? 0;
  const totalPending = d ? Object.values(d.pending).reduce((a, b) => a + b, 0) : 0;
  const hostHref = myId ? "/social/new" : { pathname: "/login", params: { next: "/social/new" } };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-8" keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={() => void data.refetch()} />}>
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Heading>Social</Heading>
            <Muted className="text-sm">Plans hosted by students. Join one or start your own.</Muted>
          </View>
          <Link href={hostHref as never} asChild>
            <Button testID="host">+ Host</Button>
          </Link>
        </View>

        {/* Tabs */}
        <View className="mt-6 flex-row rounded-2xl border border-line bg-surface p-1">
          {(["discover", "hosting", "going"] as const).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} testID={`tab-${t}`} className={`relative flex-1 items-center rounded-xl py-2.5 ${tab === t ? "bg-brand" : ""}`}>
              <T variant="bold" className={`text-sm ${tab === t ? "text-brand-ink" : "text-muted"}`}>{t === "discover" ? "Discover" : t === "hosting" ? "Hosting" : "Going"}</T>
              {t === "hosting" && hostingBadge > 0 && (
                <View className="absolute right-2 top-1 min-w-[18px] items-center rounded-full bg-live px-1" testID="hosting-badge">
                  <T variant="bold" className="text-[10px] leading-[18px] text-white">{hostingBadge}</T>
                </View>
              )}
            </Pressable>
          ))}
        </View>

        {tab === "discover" && (
          <View className="mt-5">
            <Filters filters={filters} onChange={setFilters} />
          </View>
        )}
        {tab === "hosting" && totalPending > 0 && (
          <T variant="semibold" className="mt-5 rounded-2xl bg-live/10 px-4 py-3 text-sm text-live">{totalPending} {totalPending === 1 ? "person is" : "people are"} waiting for your answer.</T>
        )}
        {(tab === "hosting" || tab === "going") && !myId && (
          <Card className="mt-5 flex-row flex-wrap items-center justify-between gap-3">
            <T variant="semibold">Log in to see what you&apos;re {tab}.</T>
            <Link href={{ pathname: "/login", params: { next: "/social" } }} asChild>
              <Button>Log in</Button>
            </Link>
          </Card>
        )}

        <View className="mt-5 gap-3" testID="social-list">
          {data.isPending && <Muted>Loading…</Muted>}
          {data.isError && <T variant="semibold" className="text-sm text-danger">Couldn&apos;t load events. Pull down to try again.</T>}
          {shown.map((e) => (
            <SocialEventCard key={e.id} event={e} host={tab === "hosting" ? null : d?.hosts.get(e.host_id)} status={d?.status[e.id]} pending={d?.pending[e.id]} />
          ))}
          {d && shown.length === 0 && (tab === "discover" || myId) && (
            <Card className="items-center py-10">
              <T variant="semibold" className="text-center">
                {tab === "discover" ? (filtered ? "Nothing matches those filters. Try clearing some." : "No events yet. Be the first to host one!") : tab === "hosting" ? "You're not hosting anything yet." : "You haven't joined anything yet. Have a look in Discover."}
              </T>
              {tab !== "going" && !filtered && (
                <Link href={hostHref as never} asChild>
                  <Button className="mt-4">Host an event</Button>
                </Link>
              )}
              {tab === "going" && <Button className="mt-4" onPress={() => setTab("discover")}>Discover events</Button>}
            </Card>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
