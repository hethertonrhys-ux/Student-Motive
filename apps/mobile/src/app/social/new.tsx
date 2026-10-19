import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createSocialEvent, uniById } from "@function/shared";
import { SocialEventForm } from "@/components/social/event-form";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// Host an event: five-a-side, a study session, pres, a gallery trip.
export default function NewSocialEventScreen() {
  const { session } = useSession();
  const { profile } = useProfile();
  const router = useRouter();
  const queryClient = useQueryClient();
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-8" keyboardShouldPersistTaps="handled">
        <Link href="/(tabs)/social" asChild>
          <Pressable className="self-start">
            <T variant="semibold" className="text-sm text-muted">← Social</T>
          </Pressable>
        </Link>
        <Heading className="mt-3">Host an event</Heading>
        <Muted className="mb-6 mt-1">Five-a-side, a study session, pres, a gallery trip: anything you&apos;re up for.</Muted>
        {!session ? (
          <Card className="flex-row flex-wrap items-center justify-between gap-3">
            <T variant="semibold">Log in to host an event.</T>
            <Link href={{ pathname: "/login", params: { next: "/social/new" } }} asChild>
              <Button>Log in</Button>
            </Link>
          </Card>
        ) : (
          <Card>
            <SocialEventForm
              centre={uniById(profile?.university)?.centre}
              onSubmit={async (input) => {
                const result = await createSocialEvent(supabase, session.user.id, input);
                if ("error" in result) return { error: result.error };
                await queryClient.invalidateQueries({ queryKey: ["social-tab"] });
                router.replace({ pathname: "/social/[id]", params: { id: result.id, created: "1" } } as never);
                return {};
              }}
            />
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
