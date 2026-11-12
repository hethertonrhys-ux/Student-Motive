import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { communityPath, COMMUNITY_ROLE_LABELS, loadSocietiesTab, myCommunities, uniShort, type MyCommunity } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { CommunityLogo } from "@/components/community/community-header";
import { Icon } from "@/components/icon";
import { SocietySearch } from "@/components/society-search";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { usePullToRefresh, useRefetchOnFocus } from "@/lib/use-refetch-on-focus";
import { useSession } from "@/providers/session";

// The Societies tab: your communities (only for people in one or waiting
// to join one), find societies, your memberships, the ones you run (only
// for people who manage one), and two buttons to the society events pages
// (everything coming up, and the ones you're going to).
export default function SocietiesScreen() {
  const { session } = useSession();
  const { profile } = useProfile();
  const me = profile ? { id: profile.id, university: profile.university } : null;
  const tab = useQuery({ queryKey: ["societies-tab", me?.id ?? null, me?.university ?? null], queryFn: () => loadSocietiesTab(supabase, me), enabled: !session || !!profile });
  useRefetchOnFocus(tab);
  // Its own query, so the rest of the tab works even if this can't load
  // (e.g. before the communities migration has run).
  const communities = useQuery({ queryKey: ["my-communities", session?.user.id ?? null], queryFn: () => myCommunities(supabase).catch(() => [] as MyCommunity[]), enabled: !!session });
  useRefetchOnFocus(communities);
  const queryClient = useQueryClient();
  const pull = usePullToRefresh(() => Promise.all([tab.refetch(), queryClient.invalidateQueries({ queryKey: ["filter-context"] }), queryClient.invalidateQueries({ queryKey: ["recommended", "society"] }), communities.refetch()]));
  const data = tab.data;
  const myUni = profile?.university;
  const runs = data?.runs ?? [];

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-8" keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={() => void pull.onRefresh()} />}>
        <Heading>Societies</Heading>
        <Muted className="mt-1 text-sm">{myUni ? `Every ${uniShort(myUni)} society, hall and more in one place.` : "Every society, hall and more across London's unis."}</Muted>

        {session && !!communities.data?.length && <YourCommunities list={communities.data} />}

        <SocietySearch societies={data?.all ?? []} myUni={myUni} relations={data?.relations} />
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

        {/* Only for people who manage a society. */}
        {session && profile && runs.length > 0 && (
          <View className="mt-8" testID="societies-you-run">
            <T variant="display" className="text-xl">Societies you run</T>
            <Muted className="mt-1 text-sm">{runs.length === 1 ? runs[0].name : `${runs.length} societies`}: post events, approve members and see who&apos;s coming.</Muted>
            {/* One society: straight to its dashboard. More: pick one there. */}
            <Link href={(runs.length === 1 ? `/dashboard/${runs[0].id}` : "/dashboard") as never} asChild>
              <Button className="mt-3" testID="dashboard-link">Society dashboard</Button>
            </Link>
          </View>
        )}

        {me && (
          <View className="mt-8 gap-3" testID="society-event-buttons">
            <EventsButton href="/society-events" icon="calendar-outline" title="Events coming up" detail="Every society event in the next two weeks" testID="events-coming-up" />
            <EventsButton
              href="/society-events/going"
              icon="checkmark-circle-outline"
              title="Your upcoming society events"
              detail={data?.upcoming.length ? `${data.upcoming.length} coming up` : "Events you're going to or have asked to join"}
              testID="your-upcoming"
            />
          </View>
        )}

        {/* How a committee gets started (or adds another society). */}
        {session && profile && data && (
          <Link href={"/dashboard/claim" as never} asChild>
            <Pressable className="mt-6 min-h-11 justify-center self-start" accessibilityRole="link" testID="request-manage">
              <T variant="semibold" className="text-sm text-muted">
                {runs.length > 0 ? "Run another society? " : "On a society's committee? "}
                <T variant="semibold" className="text-sm text-brand">Ask to manage its page</T>
              </T>
            </Pressable>
          </Link>
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

// The communities you're in or waiting to join, each opening its page.
function YourCommunities({ list }: { list: MyCommunity[] }) {
  return (
    <View className="mt-6" testID="your-communities">
      <T variant="display" className="text-xl">Your communities</T>
      <View className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
        {list.map((c, i) => (
          <Link key={c.id} href={communityPath(c.slug) as never} asChild>
            <Pressable accessibilityRole="link" className={`flex-row items-center gap-3 px-4 py-3 active:opacity-80 ${i > 0 ? "border-t border-line" : ""}`} testID={`community-${c.slug}`}>
              <CommunityLogo name={c.name} url={c.image_url} size={40} />
              <View className="min-w-0 flex-1">
                <T variant="semibold" numberOfLines={1}>{c.name}</T>
                {c.status === "pending" ? (
                  <T variant="semibold" className="text-xs text-brand" testID="community-waiting">Waiting for approval</T>
                ) : (
                  <Muted className="text-xs" numberOfLines={1}>As {c.nickname}{c.role !== "regular" ? ` · ${COMMUNITY_ROLE_LABELS[c.role]}` : ""}</Muted>
                )}
              </View>
              <Icon name="chevron-forward" size={18} color="#5e5d78" />
            </Pressable>
          </Link>
        ))}
      </View>
    </View>
  );
}

// A big tappable row to one of the society events pages.
function EventsButton({ href, icon, title, detail, testID }: { href: string; icon: React.ComponentProps<typeof Icon>["name"]; title: string; detail: string; testID: string }) {
  return (
    <Link href={href as never} asChild>
      <Pressable accessibilityRole="button" className="flex-row items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 active:opacity-80" testID={testID}>
        <Icon name={icon} size={24} color="#DA291C" />
        <View className="min-w-0 flex-1">
          <T variant="semibold">{title}</T>
          <Muted className="text-xs">{detail}</Muted>
        </View>
        <Icon name="chevron-forward" size={18} color="#5e5d78" />
      </Pressable>
    </Link>
  );
}
