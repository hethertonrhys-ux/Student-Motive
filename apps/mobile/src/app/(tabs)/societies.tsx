import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { loadSocietiesTab, uniShort } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { SocietySearch } from "@/components/society-search";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { usePullToRefresh, useRefetchOnFocus } from "@/lib/use-refetch-on-focus";
import { useSession } from "@/providers/session";

// The Societies tab: find societies, your memberships, the ones you run, and
// two buttons to the society events pages (everything coming up, and the
// ones you're going to).
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
  const runs = data?.runs ?? [];

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-8" keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={() => void pull.onRefresh()} />}>
        <Heading>Societies</Heading>
        <Muted className="mt-1 text-sm">{myUni ? `Every ${uniShort(myUni)} society, hall and more in one place.` : "Every society, hall and more across London's unis."}</Muted>

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

        {session && profile && (
          <View className="mt-8">
            <T variant="display" className="text-xl">Societies you run</T>
            {runs.length > 0 ? (
              <>
                <Muted className="mt-1 text-sm">{runs.length === 1 ? runs[0].name : `${runs.length} societies`}: post events, approve members and see who&apos;s coming.</Muted>
                {/* One society: straight to its dashboard. More: pick one there. */}
                <Link href={(runs.length === 1 ? `/dashboard/${runs[0].id}` : "/dashboard") as never} asChild>
                  <Button className="mt-3" testID="dashboard-link">Society dashboard</Button>
                </Link>
              </>
            ) : (
              data && <Muted className="mt-1 text-sm">On a committee? Ask to manage your society&apos;s page and we&apos;ll approve it once we&apos;ve checked.</Muted>
            )}
            <Link href={"/dashboard/claim" as never} asChild>
              <Pressable className="mt-3 min-h-11 justify-center self-start" accessibilityRole="link" testID="request-manage">
                <T variant="semibold" className="text-sm text-brand">+ Request to manage a society</T>
              </Pressable>
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
