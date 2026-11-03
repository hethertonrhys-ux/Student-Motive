import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { deleteEvent, eventAdminAvailable, getVenues, hasFeature, loadEventAdmin, loadEventForEdit, loadManagedSociety, saveEventAdminAndPublish, updateEvent } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { CommitteeEventForm } from "@/components/committee/event-form";
import { LinkButton } from "@/components/event/panels";
import { Card, Heading, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// Edit one of your society's events, or delete it. With event admin (LSE
// societies with Event admin on) the form has the event's answers too, and
// a draft is published once "Has the SU approved this event?" is Yes.
export default function EditEventScreen() {
  const { societyId, eventId } = useLocalSearchParams<{ societyId: string; eventId: string }>();
  const { session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const managed = useQuery({ queryKey: ["managed", societyId], queryFn: () => loadManagedSociety(supabase, societyId), enabled: !!session && !!societyId });
  const venues = useQuery({ queryKey: ["venues"], queryFn: () => getVenues(supabase) });
  const page = useQuery({ queryKey: ["edit-event", societyId, eventId], queryFn: () => loadEventForEdit(supabase, societyId, eventId), enabled: !!managed.data });
  const society = managed.data?.society;
  const withAdmin = !!society && !!managed.data && hasFeature(managed.data.features, "event_admin") && eventAdminAvailable(society.university);
  const admin = useQuery({ queryKey: ["event-admin", eventId], queryFn: () => loadEventAdmin(supabase, eventId), enabled: withAdmin });
  const refreshAll = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["managed", societyId] }), queryClient.invalidateQueries({ queryKey: ["event-admin", eventId] }), queryClient.invalidateQueries({ queryKey: ["edit-event", societyId, eventId] }), queryClient.invalidateQueries({ queryKey: ["event", eventId] }), queryClient.invalidateQueries({ queryKey: ["manage-event", societyId, eventId] }), queryClient.invalidateQueries({ queryKey: ["map-events"] }), queryClient.invalidateQueries({ queryKey: ["feed"] }), queryClient.invalidateQueries({ queryKey: ["founding-progress", societyId] }), queryClient.invalidateQueries({ queryKey: ["founding-badge", societyId] })]);
  return (
    <SafeAreaView className="flex-1 bg-bg">
      {/* The phone keeps the page where it is as the keyboard comes and goes. */}
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
        <BackButton fallback={`/dashboard/${societyId}`} />
        <View className="mb-8 mt-3 flex-row items-center justify-between gap-4">
          <Heading>Edit event</Heading>
          {page.data && (
            <View className="flex-row items-baseline gap-1">
              <T variant="display-bold" className="text-2xl">{page.data.event.going_count}</T>
              <Muted className="text-sm">going</Muted>
            </View>
          )}
        </View>
        {!society || !venues.data || !page.data || (withAdmin && !admin.isSuccess) ? (
          <Muted>{managed.isPending || venues.isPending || page.isPending || (withAdmin && admin.isPending) ? "Loading…" : withAdmin && admin.isError ? "Couldn't load the event admin answers. Try again." : "Event not found."}</Muted>
        ) : (
          <>
            <Card>
              <CommitteeEventForm
                key={page.data.event.id}
                venues={venues.data}
                uni={society.university}
                features={managed.data?.features}
                event={page.data.event}
                tables={page.data.tables}
                eventAdmin={admin.data ?? null}
                onSubmit={async (input, image, answers) => {
                  const r = await updateEvent(supabase, societyId, eventId, input, image ? { bytes: image.bytes, type: image.type } : null);
                  if (r.error) return r;
                  if (answers) {
                    const done = await saveEventAdminAndPublish(supabase, eventId, answers, { suApproved: Boolean(admin.data?.su_approved_at), draft: page.data?.event.is_draft === true });
                    if (done.error) return { error: done.error };
                  }
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
