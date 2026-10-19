import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { RefreshControl, ScrollView, View } from "react-native";
import { loadFeed } from "@function/shared";
import { EventCard } from "@/components/event-card";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
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

      {feed.isPending && <Muted className="mt-6">Loading…</Muted>}
      {feed.isError && (
        <T variant="semibold" className="mt-6 text-danger">
          Couldn&apos;t load events. Pull down to try again.
        </T>
      )}
      {feed.data && feed.data.length === 0 && (
        <Card className="mt-6">
          <Muted>Nothing on in the next two weeks yet. Check back soon.</Muted>
        </Card>
      )}
      {feed.data?.map((group) => (
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
