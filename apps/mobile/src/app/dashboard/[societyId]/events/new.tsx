import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createEvent, getVenues, loadManagedSociety } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { CommitteeEventForm } from "@/components/committee/event-form";
import { Card, Heading, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// Post an event for a society you run.
export default function NewEventScreen() {
  const { societyId } = useLocalSearchParams<{ societyId: string }>();
  const { session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const managed = useQuery({ queryKey: ["managed", societyId], queryFn: () => loadManagedSociety(supabase, societyId), enabled: !!session && !!societyId });
  const venues = useQuery({ queryKey: ["venues"], queryFn: () => getVenues(supabase) });
  const society = managed.data?.society;
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10" keyboardShouldPersistTaps="handled">
        <BackButton fallback={`/dashboard/${societyId}`} />
        <Heading className="mb-8 mt-3">Post an event</Heading>
        {!society || !venues.data ? (
          <Muted>{managed.isPending || venues.isPending ? "Loading…" : "You don't run this society."}</Muted>
        ) : (
          <Card>
            <CommitteeEventForm
              venues={venues.data}
              uni={society.university}
              onSubmit={async (input, image) => {
                const result = await createEvent(supabase, societyId, input, image ? { bytes: image.bytes, type: image.type } : null);
                if ("error" in result) return { error: result.error };
                await Promise.all([queryClient.invalidateQueries({ queryKey: ["managed", societyId] }), queryClient.invalidateQueries({ queryKey: ["map-events"] }), queryClient.invalidateQueries({ queryKey: ["feed"] })]);
                router.replace({ pathname: "/dashboard/[societyId]", params: { societyId, posted: "1" } } as never);
                return {};
              }}
            />
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
