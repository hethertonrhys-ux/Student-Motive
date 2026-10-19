import { useQuery } from "@tanstack/react-query";
import { Pressable, View } from "react-native";
import { RECOMMEND_LIMIT, filterContextKey, loadSocietyRecommendations, matchesPersonalFilters, type FeedItem, type FilterContext, type Me, type PersonalFilters } from "@function/shared";
import { EventCard } from "@/components/event-card";
import { Card, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useRefetchOnFocus } from "@/lib/use-refetch-on-focus";

// "All | Recommended" under a search box. The same control on the Societies
// tab and the Social tab.
export type ListMode = "all" | "recommended";

export function ListModeSwitch({ mode, onChange, allLabel = "All", testID = "list-mode" }: { mode: ListMode; onChange: (mode: ListMode) => void; allLabel?: string; testID?: string }) {
  return (
    <View className="flex-row self-start rounded-2xl border border-line bg-surface p-1" accessibilityRole="tablist" testID={testID}>
      {(["all", "recommended"] as const).map((m) => (
        <Pressable key={m} onPress={() => onChange(m)} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} testID={`${testID}-${m}`} className={`rounded-xl px-4 py-2 ${mode === m ? "bg-brand" : ""}`}>
          <T variant="bold" className={`text-sm ${mode === m ? "text-brand-ink" : "text-muted"}`}>{m === "all" ? allLabel : "Recommended"}</T>
        </Pressable>
      ))}
    </View>
  );
}

export const EMPTY_RECOMMENDED_SOCIAL = "No plans to recommend right now. Add a few friends and check back, or look in All plans.";
export const EMPTY_RECOMMENDED_SOCIETY = "No society events to recommend in the next two weeks. Join a society or add a few friends and this fills up.";
export const RECOMMEND_ERROR = "Couldn't load recommendations. Pull down to try again.";

// Society events coming up (the next two weeks, not counting ones you've
// joined): all of them soonest first, or the ones picked for you (your
// societies, your friends' events, what's popular at your uni).
export function SocietyEventsForYou({ me, who, ready = true, personal, mode }: { me: Me; who: FilterContext; ready?: boolean; personal?: PersonalFilters; mode: ListMode }) {
  // Waits for your friends and societies to be known, or "Your society" would be missed;
  // they're part of the key, so a new friend or society refreshes the list.
  const recs = useQuery({ queryKey: ["recommended", "society", me.id, filterContextKey(who)], queryFn: () => loadSocietyRecommendations(supabase, me, who), enabled: ready });
  useRefetchOnFocus(recs);
  const keep = (e: FeedItem) => !personal || matchesPersonalFilters(e, who, personal);
  const recommended = (recs.data?.recommended ?? []).filter((r) => keep(r.event)).slice(0, RECOMMEND_LIMIT);
  const all = (recs.data?.all ?? []).filter(keep).slice(0, 50);
  return (
    <View className="mt-3 gap-3" testID={mode === "recommended" ? "recommended-society" : "all-society"}>
      {(recs.isPending || !ready) && <Muted>{mode === "recommended" ? "Finding events for you…" : "Loading…"}</Muted>}
      {recs.isError && <T variant="semibold" className="text-sm text-danger">{RECOMMEND_ERROR}</T>}
      {mode === "recommended" ? recommended.map((r) => <EventCard key={r.event.id} item={r.event} note={r.reasons.join(" · ")} />) : all.map((e) => <EventCard key={e.id} item={e} />)}
      {recs.data && (mode === "recommended" ? recommended : all).length === 0 && (
        <Card>
          <Muted>{mode === "recommended" ? EMPTY_RECOMMENDED_SOCIETY : personal && (personal.friendsHosting || personal.mySocieties) ? "Nothing matches your filters. Untick a box to see more." : "No society events in the next two weeks yet."}</Muted>
        </Card>
      )}
    </View>
  );
}
