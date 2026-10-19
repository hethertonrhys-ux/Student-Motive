import { Link, Stack } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Muted, T } from "@/components/ui";

export default function NotFound() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <Stack.Screen options={{ title: "Not found" }} />
      <View className="mx-auto w-full max-w-md items-center px-4 py-24">
        <T variant="display-bold" className="text-6xl text-brand">404</T>
        <T variant="display-bold" className="mt-3 text-2xl" testID="not-found">We couldn&apos;t find that</T>
        <Muted className="mt-2 text-center">It may have been removed, or the link is wrong.</Muted>
        <Link href="/" asChild><Button className="mt-6">Go home</Button></Link>
      </View>
    </SafeAreaView>
  );
}
