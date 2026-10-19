import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { logSignupEvent } from "@function/shared";
import { Button, Card, Heading, Muted } from "@/components/ui";
import { needsWelcome } from "@/lib/profile";
import { loginPending, welcomed } from "@/lib/storage";
import { supabase } from "@/lib/supabase";

// The login link in the email lands here (on the web as a page, on phones
// as a deep link). The one-time code in the link is swapped for a session,
// then you're sent on to where you were going.
export default function AuthCallback() {
  const router = useRouter();
  const { code, next: nextParam } = useLocalSearchParams<{ code?: string; next?: string }>();
  const next = typeof nextParam === "string" && nextParam.startsWith("/") ? nextParam : "/(tabs)/map";
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      if (typeof code !== "string") return setFailed(true);
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.user) return setFailed(true);
      await loginPending.set(null);
      if (await needsWelcome(data.user.id, data.user.created_at, await welcomed.get())) {
        await logSignupEvent(supabase, "signup_finished");
        router.replace({ pathname: "/welcome", params: { next } });
      } else {
        router.replace(next as never);
      }
    })();
  }, [code, next, router]);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="mx-auto w-full max-w-md px-4 py-16">
        {failed ? (
          <Card className="gap-3">
            <Heading className="text-2xl">That login link didn&apos;t work</Heading>
            <Muted>It may have expired, or been opened on a different device. Request a new one.</Muted>
            <Button onPress={() => router.replace("/login")}>Back to log in</Button>
          </Card>
        ) : (
          <Muted>Logging you in…</Muted>
        )}
      </View>
    </SafeAreaView>
  );
}
