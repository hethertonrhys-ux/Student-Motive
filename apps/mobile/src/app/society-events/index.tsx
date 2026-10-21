import { useQueryClient } from "@tanstack/react-query";
import { RefreshControl, View } from "react-native";
import { BackButton } from "@/components/back-button";
import { PersonalFilterBoxes } from "@/components/personal-filters";
import { SocietyEventsForYou } from "@/components/recommended-events";
import { Card, Heading, Muted, Screen } from "@/components/ui";
import { useFilterContext } from "@/lib/filter-context";
import { usePersonalFilters } from "@/lib/personal-filters";
import { useProfile } from "@/lib/profile";
import { usePullToRefresh } from "@/lib/use-refetch-on-focus";
import { useSession } from "@/providers/session";

// Societies → Events coming up: every society event in the next two weeks,
// soonest first, with a tick box for just the societies you're a member of.
// Anyone can open an event; joining works as each society set it up (some
// are members only or need the committee's OK).
export default function SocietyEventsScreen() {
  const { session } = useSession();
  const { profile } = useProfile();
  const me = profile ? { id: profile.id, university: profile.university } : null;
  const { context: who, ready } = useFilterContext();
  const [personal, setPersonal] = usePersonalFilters();
  // Only the societies box counts here (the friends box is Social's).
  const filters = { friendsHosting: false, mySocieties: personal.mySocieties };
  const queryClient = useQueryClient();
  const pull = usePullToRefresh(() => queryClient.invalidateQueries({ queryKey: ["recommended", "society"] }));

  return (
    <Screen refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={() => void pull.onRefresh()} />}>
      <BackButton fallback="/(tabs)/societies" label="Back to Societies" />
      <Heading className="mt-3">Events coming up</Heading>
      <Muted className="mt-1 text-sm">Every society event in the next two weeks. Open one to see if it&apos;s open to everyone or for members.</Muted>
      {me ? (
        <>
          <View className="mt-4 rounded-2xl border border-line bg-surface px-2 py-1">
            <PersonalFilterBoxes filters={filters} onChange={(next) => setPersonal({ ...personal, mySocieties: next.mySocieties })} only="mySocieties" testID="society-events-filter" />
          </View>
          <SocietyEventsForYou me={me} who={who} ready={ready} personal={filters} mode="all" />
        </>
      ) : (
        <Card className="mt-6">
          <Muted>{session ? "Loading…" : "Log in to see society events."}</Muted>
        </Card>
      )}
    </Screen>
  );
}
