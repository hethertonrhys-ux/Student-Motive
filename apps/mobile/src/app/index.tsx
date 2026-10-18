import { Link, Redirect } from "expo-router";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ALL_UNIS_TEXT } from "@function/shared";
import { Button, Heading, Muted, T } from "@/components/ui";
import { useSession } from "@/providers/session";

// The front door. Logged in: straight to the map. Logged out: the landing
// page (the same words as the website's), with the map still one tap away.
export default function Index() {
  const { session, loading } = useSession();
  if (loading) return <View className="flex-1 bg-bg" />;
  if (session) return <Redirect href="/(tabs)/map" />;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-5xl px-4 py-16">
        <View className="mb-4 flex-row items-center gap-2 self-start rounded-full bg-brand-soft px-3 py-1">
          <View className="size-2 rounded-full bg-live" />
          <T variant="semibold" className="text-sm text-brand">Now at {ALL_UNIS_TEXT}</T>
        </View>
        <Heading className="max-w-3xl text-5xl leading-[1.05]">London&apos;s student social life, all in one place.</Heading>
        <T variant="semibold" className="mt-5 max-w-2xl text-lg">For students at {ALL_UNIS_TEXT}.</T>
        <Muted className="mt-2 max-w-2xl text-lg">
          Function puts every society and every event in one place. Students open the map and see what&apos;s happening
          tonight. Societies post once and reach everyone.
        </Muted>
        <View className="mt-8 flex-row flex-wrap gap-3">
          <Link href="/login" asChild>
            <Button className="px-5 py-3">Log in with your uni email</Button>
          </Link>
          <Link href="/(tabs)/map" asChild>
            <Button variant="ghost" className="px-5 py-3">See the live map</Button>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
