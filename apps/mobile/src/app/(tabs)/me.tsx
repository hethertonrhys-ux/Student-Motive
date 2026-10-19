import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { uniShort } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// Your own corner: who you're logged in as, and the way out. The full
// profile (photos, prompts, Two truths) arrives in phase 7.
export default function MeScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  async function logOut() {
    await supabase.auth.signOut();
    queryClient.clear();
    router.replace("/");
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-8">
        <Heading>Me</Heading>
        {!session ? (
          <Card className="mt-6 flex-row flex-wrap items-center justify-between gap-3">
            <T variant="semibold">Log in to see your profile.</T>
            <Link href="/login" asChild>
              <Button>Log in</Button>
            </Link>
          </Card>
        ) : profile ? (
          <>
            <Card className="mt-6 items-center gap-3">
              <Avatar name={profile.display_name || "You"} size={88} />
              <View className="items-center">
                <T variant="display" className="text-2xl">{profile.display_name || "Add your name"}</T>
                <Muted>{uniShort(profile.university)} · {profile.email}</Muted>
              </View>
            </Card>
            <Card className="mt-4">
              <Muted>Photos, prompts and Two truths and a lie arrive in phase 7.</Muted>
            </Card>
            <Button variant="ghost" className="mt-6" onPress={logOut} testID="log-out">Log out</Button>
          </>
        ) : (
          <View className="mt-6">
            <Muted>Loading…</Muted>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
