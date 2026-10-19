import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { deleteEvent, getVenues, loadEventForEdit, loadManagedSociety, updateEvent } from "@function/shared";
import { CommitteeEventForm } from "@/components/committee/event-form";
import { LinkButton } from "@/components/event/panels";
import { Card, Heading, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// Edit one of your society's events, or delete it.
export default function EditEventScreen() {
  const { societyId, eventId } = useLocalSearchParams<{ societyId: string; eventId: string }>();
  const { session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const managed = useQuery({ queryKey: ["managed", societyId], queryFn: () => loadManagedSociety(supabase, societyId), enabled: !!session && !!societyId });
  const venues = useQuery({ queryKey: ["venues"], queryFn: () => getVenues(supabase) });
  const page = useQuery({ queryKey: ["edit-event", societyId, eventId], queryFn: () => loadEventForEdit(supabase, societyId, eventId), enabled: !!managed.data });
  const society = managed.data?.society;
  const refreshAll = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["managed", societyId] }), queryClient.invalidateQueries({ queryKey: ["edit-event", societyId, eventId] }), queryClient.invalidateQueries({ queryKey: ["event", eventId] }), queryClient.invalidateQueries({ queryKey: ["manage-event", societyId, eventId] }), queryClient.invalidateQueries({ queryKey: ["map-events"] }), queryClient.invalidateQueries({ queryKey: ["feed"] })]);
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10" keyboardShouldPersistTaps="handled">
        <Link href={`/dashboard/${societyId}` as never} asChild>
          <Pressable className="self-start">
            <T variant="semibold" className="text-sm text-muted">← {society?.name ?? "Back"}</T>
          </Pressable>
        </Link>
        <View className="mb-8 mt-3 flex-row items-center justify-between gap-4">
          <Heading>Edit event</Heading>
          {page.data && (
            <View className="flex-row items-baseline gap-1">
              <T variant="display-bold" className="text-2xl">{page.data.event.going_count}</T>
              <Muted className="text-sm">going</Muted>
            </View>
          )}
        </View>
        {!society || !venues.data || !page.data ? (
          <Muted>{managed.isPending || venues.isPending || page.isPending ? "Loading…" : "Event not found."}</Muted>
        ) : (
          <>
            <Card>
              <CommitteeEventForm
                key={page.data.event.id}
                venues={venues.data}
                uni={society.university}
                event={page.data.event}
                tables={page.data.tables}
                onSubmit={async (input, image) => {
                  const r = await updateEvent(supabase, societyId, eventId, input, image ? { bytes: image.bytes, type: image.type } : null);
                  if (r.error) return r;
                  await refreshAll();
                  router.replace(`/dashboard/${societyId}` as never);
                  return {};
                }}
              />
            </Card>
            <View className="mt-6">
              <LinkButton
                onPress={() =>
                  void deleteEvent(supabase, societyId, eventId).then(async (r) => {
                    if (r.error) return;
                    await refreshAll();
                    router.replace(`/dashboard/${societyId}` as never);
                  })
                }
                confirmText="Delete this event? This can't be undone."
                danger
                testID="delete-event"
              >
                Delete event
              </LinkButton>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
