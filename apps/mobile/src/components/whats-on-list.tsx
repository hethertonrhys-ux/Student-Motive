import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { RefreshControl, ScrollView, View } from "react-native";
import { isPersonalFiltering, loadFeed, matchesPersonalFilters } from "@function/shared";
import { useMemo } from "react";
import { EventCard } from "@/components/event-card";
import { PersonalFilterBoxes } from "@/components/personal-filters";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { useFilterContext } from "@/lib/filter-context";
import { usePersonalFilters } from "@/lib/personal-filters";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// What's on as a list: tonight, tomorrow and the next two weeks. One tap
// from the map (the List button).
export function WhatsOnList() {
  const { session } = useSession();
  const { profile } = useProfile();
  const myUni = profile?.university ?? null;
  const feed = useQuery({
    queryKey: ["feed", myUni],
    queryFn: () => loadFeed(supabase, myUni),
  });
  const [personal, setPersonal] = usePersonalFilters();
  const { context: who, ready: whoReady } = useFilterContext();
  const personalOn = !!session && whoReady && isPersonalFiltering(personal);
  const groups = useMemo(() => {
    const all = feed.data ?? [];
    if (!personalOn) return all;
    return all.map((g) => ({ ...g, items: g.items.filter((e) => matchesPersonalFilters(e, who, personal)) })).filter((g) => g.items.length > 0);
  }, [feed.data, personalOn, who, personal]);

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="mx-auto w-full max-w-2xl px-4 pb-8 pt-20"
      refreshControl={
        <RefreshControl
          refreshing={feed.isRefetching}
          onRefresh={() => void feed.refetch()}
        />
      }
    >
      <Heading>What&apos;s on</Heading>
      <Muted className="mt-1 text-sm">
        Society events and socials across London&apos;s unis.
      </Muted>

      {!session && (
        <Card className="mt-6 flex-row flex-wrap items-center justify-between gap-3">
          <T variant="semibold" className="flex-1">
            Log in to see your uni&apos;s events and say you&apos;re going.
          </T>
          <Link href="/login" asChild>
            <Button>Log in</Button>
          </Link>
        </Card>
      )}

      {session && (
        <View className="mt-4 rounded-2xl border border-line bg-surface px-2 py-1">
          <PersonalFilterBoxes filters={personal} onChange={setPersonal} compact testID="list-personal" />
        </View>
      )}

      {feed.isPending && <Muted className="mt-6">Loading…</Muted>}
      {feed.isError && (
        <T variant="semibold" className="mt-6 text-danger">
          Couldn&apos;t load events. Pull down to try again.
        </T>
      )}
      {feed.data && groups.length === 0 && (
        <Card className="mt-6">
          <Muted>{personalOn ? "Nothing matches your filters. Untick a box to see more." : "Nothing on in the next two weeks yet. Check back soon."}</Muted>
        </Card>
      )}
      {groups.map((group) => (
        <View key={group.key} className="mt-8" testID={`group-${group.key}`}>
          <T variant="display" className="text-xl">
            {group.title}
          </T>
          <View className="mt-3 gap-3">
            {group.items.map((item) => (
              <EventCard key={item.href} item={item} />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
