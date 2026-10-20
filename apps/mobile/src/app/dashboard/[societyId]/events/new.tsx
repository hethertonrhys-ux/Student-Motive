import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createEvent, getVenues, loadManagedSociety, saveEventAdminAndPublish, updateEvent } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { CommitteeEventForm } from "@/components/committee/event-form";
import { Card, Heading, Muted } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// Post an event for a society you run. Opened from the Society Hub's setup
// (?from=hub), posting goes on to the setup's last step to share the event.
// LSE societies with Event admin on answer the event admin questions and
// "Has the SU approved this event?": the event is saved as a draft with its
// answers, then published if the SU has approved it (the database refuses to
// publish it otherwise, so a half-finished save never leaves it live).
export default function NewEventScreen() {
  const { societyId, from } = useLocalSearchParams<{ societyId: string; from?: string }>();
  const fromHub = from === "hub";
  const { session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const managed = useQuery({ queryKey: ["managed", societyId], queryFn: () => loadManagedSociety(supabase, societyId), enabled: !!session && !!societyId });
  const venues = useQuery({ queryKey: ["venues"], queryFn: () => getVenues(supabase) });
  const society = managed.data?.society;
  // Once the event exists, trying again (after an error) carries on with it rather than posting it twice.
  const created = useRef<string | null>(null);
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10" keyboardShouldPersistTaps="handled">
        <BackButton fallback={fromHub ? `/hub/${societyId}/setup?step=event` : `/dashboard/${societyId}`} />
        <Heading className="mb-8 mt-3">Post an event</Heading>
        {!society || !venues.data ? (
          <Muted>{managed.isPending || venues.isPending ? "Loading…" : "You don't run this society."}</Muted>
        ) : (
          <Card>
            <CommitteeEventForm
              venues={venues.data}
              uni={society.university}
              features={managed.data?.features}
              onSubmit={async (input, image, admin) => {
                const photo = image ? { bytes: image.bytes, type: image.type } : null;
                let id = created.current;
                if (id) {
                  const saved = await updateEvent(supabase, societyId, id, input, photo);
                  if (saved.error) return saved;
                } else {
                  // With event admin, the event starts as a draft.
                  const result = await createEvent(supabase, societyId, { ...input, isDraft: admin !== null }, photo);
                  if ("id" in result && result.id) created.current = result.id;
                  if ("error" in result) return { error: result.error };
                  id = result.id;
                }
                let draft = false;
                if (admin) {
                  const done = await saveEventAdminAndPublish(supabase, id, admin, { suApproved: false, draft: true });
                  if (done.error) return { error: `Your event is saved as a draft. ${done.error}` };
                  draft = !done.published;
                }
                await Promise.all([queryClient.invalidateQueries({ queryKey: ["managed", societyId] }), queryClient.invalidateQueries({ queryKey: ["map-events"] }), queryClient.invalidateQueries({ queryKey: ["feed"] }), queryClient.invalidateQueries({ queryKey: ["founding-progress", societyId] }), queryClient.invalidateQueries({ queryKey: ["founding-badge", societyId] })]);
                // Back to the Hub's setup underneath, on its last step (or open it there).
                if (fromHub) router.dismissTo({ pathname: "/hub/[societyId]/setup", params: { societyId, step: "live", event: id, ...(draft ? { draft: "1" } : {}) } } as never);
                else router.replace({ pathname: "/dashboard/[societyId]", params: { societyId, posted: "1", ...(draft ? { draft: "1" } : {}) } } as never);
                return {};
              }}
            />
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
