import { useQuery } from "@tanstack/react-query";
import { Link, useIsFocused } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RECOMMEND_LIMIT, filterContextKey, isPersonalFiltering, loadSocialRecommendations, loadSocialTab, matchesDiscover, matchesPersonalFilters, nowMs, type DiscoverFilters, type SocialEvent, type SocialTab } from "@function/shared";
import { EMPTY_RECOMMENDED_SOCIAL, ListModeSwitch, RECOMMEND_ERROR, type ListMode } from "@/components/recommended-events";
import { SocialEventCard } from "@/components/social/event-card";
import { EMPTY_FILTERS, Filters } from "@/components/social/filters";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { useFilterContext } from "@/lib/filter-context";
import { usePersonalFilters } from "@/lib/personal-filters";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { usePullToRefresh, useRefetchOnFocus } from "@/lib/use-refetch-on-focus";
import { useSession } from "@/providers/session";

// The Social tab: plans hosted by students. Discover, what you're hosting
// and what you're going to.
export default function SocialScreen() {
  const { session, loading } = useSession();
  const myId = session?.user.id ?? null;
  const focused = useIsFocused();
  const [tab, setTab] = useState<SocialTab>("discover");
  const [filters, setFilters] = useState<DiscoverFilters>(EMPTY_FILTERS);
  const [mode, setMode] = useState<ListMode>("all");
  const { profile, loading: profileLoading } = useProfile();
  const { context: who, ready: whoReady } = useFilterContext();
  const [personal, setPersonal] = usePersonalFilters();
  const personalOn = !!myId && whoReady && isPersonalFiltering(personal);
  const keep = (e: SocialEvent) => matchesDiscover(e, filters, now) && (!personalOn || matchesPersonalFilters({ hostId: e.host_id, societyId: null }, who, personal));
  const recommending = tab === "discover" && mode === "recommended" && !!myId;
  // Friends and societies are part of the key, so a new friend or society refreshes the picks.
  const recs = useQuery({ queryKey: ["recommended", "social", myId, filterContextKey(who)], queryFn: () => loadSocialRecommendations(supabase, { id: myId!, university: profile?.university ?? null }, who), enabled: recommending && !!profile && whoReady });
  useRefetchOnFocus(recs);
  const recsFailed = recs.isError || (recommending && !profileLoading && !profile);
  // Waits for the saved login to be read, so a cold start fetches once, not twice.
  const data = useQuery({ queryKey: ["social-tab", tab, myId], queryFn: () => loadSocialTab(supabase, myId, tab), enabled: !loading, refetchInterval: focused ? 60_000 : false });
  useRefetchOnFocus(data);
  const pull = usePullToRefresh(() => Promise.all([data.refetch(), recommending ? recs.refetch() : Promise.resolve(null)]));
  const d = data.data;
  const now = nowMs();
  const filtered = Boolean(filters.categories.length || filters.date || filters.type || filters.available || filters.q.trim() || personalOn);
  const shown = useMemo(() => {
    if (recommending) return (recs.data?.items ?? []).map((r) => r.event).filter(keep).slice(0, RECOMMEND_LIMIT);
    return d && tab === "discover" ? d.events.filter(keep) : (d?.events ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, tab, filters, now, recommending, recs.data, personalOn, who, personal]);
  const notes = useMemo(() => new Map((recs.data?.items ?? []).map((r) => [r.event.id, r.reasons.join(" · ")])), [recs.data]);
  const hostOf = (hostId: string) => (recommending ? recs.data?.hosts.get(hostId) : d?.hosts.get(hostId));
  const hostingBadge = d?.hostingBadge ?? 0;
  const totalPending = d ? Object.values(d.pending).reduce((a, b) => a + b, 0) : 0;
  const hostHref = myId ? "/social/new" : { pathname: "/login", params: { next: "/social/new" } };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-4" keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={() => void pull.onRefresh()} />}>
        <View className="flex-row items-center justify-between gap-3">
          <Heading className="text-2xl">Social</Heading>
          <Link href={hostHref as never} asChild>
            <Button className="py-2" testID="host">+ Host</Button>
          </Link>
        </View>

        {/* Tabs: right at the top, under your thumb. */}
        <View className="mt-3 flex-row rounded-2xl border border-line bg-surface p-1">
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
          <View className="mt-3">
            <Muted className="mb-3 text-sm">Plans hosted by students. Join one or start your own.</Muted>
            <Filters filters={filters} onChange={setFilters} personal={myId ? personal : undefined} onPersonalChange={myId ? setPersonal : undefined} />
            {myId && (
              <View className="mt-3">
                <ListModeSwitch mode={mode} onChange={setMode} allLabel="All plans" testID="social-mode" />
              </View>
            )}
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
          {(recommending ? recs.isPending && !recsFailed : data.isPending) && <Muted>{recommending ? "Finding plans for you…" : "Loading…"}</Muted>}
          {(recommending ? recsFailed : data.isError) && <T variant="semibold" className="text-sm text-danger">{recommending ? RECOMMEND_ERROR : "Couldn't load events. Pull down to try again."}</T>}
          {shown.map((e) => (
            <SocialEventCard key={e.id} event={e} host={tab === "hosting" ? null : hostOf(e.host_id)} status={d?.status[e.id]} pending={d?.pending[e.id]} note={recommending ? notes.get(e.id) : undefined} />
          ))}
          {(recommending ? !!recs.data : !!d) && shown.length === 0 && (tab === "discover" || myId) && (
            <Card className="items-center py-10">
              <T variant="semibold" className="text-center">
                {recommending ? (filtered ? "Nothing recommended matches. Try All plans." : EMPTY_RECOMMENDED_SOCIAL) : tab === "discover" ? (filtered ? "Nothing matches those filters. Try clearing some." : "No events yet. Be the first to host one!") : tab === "hosting" ? "You're not hosting anything yet." : "You haven't joined anything yet. Have a look in Discover."}
              </T>
              {tab !== "going" && !filtered && !recommending && (
                <Link href={hostHref as never} asChild>
                  <Button className="mt-4">Host an event</Button>
                </Link>
              )}
              {tab === "going" && <Button className="mt-4" onPress={() => setTab("discover")}>Discover events</Button>}
              {recommending && <Button className="mt-4" onPress={() => setMode("all")} testID="show-all-plans">Show all plans</Button>}
            </Card>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
