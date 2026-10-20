import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SOCIAL_EVENT_FIELDS, isoToLondonInput, uniById, updateSocialEvent, type SocialEvent } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { SocialEventForm } from "@/components/social/event-form";
import { Card, Heading, Muted } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

type Exact = { address: string | null; lat: number | null; lng: number | null };

// Edit your own Social event.
export default function EditSocialEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { profile } = useProfile();
  const router = useRouter();
  const queryClient = useQueryClient();
  const myId = session?.user.id ?? null;
  const page = useQuery({
    queryKey: ["social-edit", id, myId],
    enabled: !!id && !!myId,
    queryFn: async () => {
      const [{ data: event }, { data: exact }] = await Promise.all([
        supabase.from("social_events").select(SOCIAL_EVENT_FIELDS).eq("id", id).eq("host_id", myId!).maybeSingle(),
        supabase.from("social_event_addresses").select("address, lat, lng").eq("event_id", id).maybeSingle<Exact>(),
      ]);
      return { event: (event as SocialEvent | null) ?? null, exact: exact ?? null };
    },
  });
  const ev = page.data?.event;
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-8" keyboardShouldPersistTaps="handled">
        <BackButton fallback={`/social/${id}`} />
        <Heading className="mb-6 mt-3">Edit your event</Heading>
        {!myId || page.isPending ? (
          <Muted>Loading…</Muted>
        ) : !ev ? (
          <Card><Muted>Only the host can edit this event.</Muted></Card>
        ) : (
          <Card>
            <SocialEventForm
              event={ev}
              exact={page.data?.exact}
              defaults={{ date: isoToLondonInput(ev.starts_at).slice(0, 10), start: isoToLondonInput(ev.starts_at).slice(11, 16), finish: isoToLondonInput(ev.ends_at).slice(11, 16) }}
              centre={uniById(profile?.university)?.centre}
              onSubmit={async (input) => {
                const result = await updateSocialEvent(supabase, myId, id, input);
                if (result.error) return result;
                await Promise.all([queryClient.invalidateQueries({ queryKey: ["social-event", id] }), queryClient.invalidateQueries({ queryKey: ["social-tab"] }), queryClient.invalidateQueries({ queryKey: ["map-events"] })]);
                router.replace(`/social/${id}` as never);
                return {};
              }}
            />
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
