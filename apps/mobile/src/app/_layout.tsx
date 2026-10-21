import "../global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { AccountGate } from "@/components/account-gate";
import { LaunchSplash } from "@/components/launch-splash";
import { PushLifecycle } from "@/components/push-lifecycle";
import { UpdateBanner } from "@/components/update-banner";
import { SessionProvider } from "@/providers/session";

SplashScreen.preventAutoHideAsync();

// Reads are cached for a minute, like the website's cached tabs, so going
// back to a screen is instant.
// refetchOnWindowFocus is off: coming back to the app used to refetch every
// cached query at once; now the screen you're looking at refreshes itself
// (useRefetchOnFocus) and the others refresh when you open them.
const [queryClient] = [new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } } })];

export default function RootLayout() {
  const [client] = useState(queryClient);

  // The text is in the phone's own font, so there's nothing to wait for.
  // On phones the opening animation (LaunchSplash) hides the launch screen
  // once it's on screen in its place.
  useEffect(() => {
    if (Platform.OS === "web") SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={client}>
      <SessionProvider>
        <AccountGate />
        <PushLifecycle />
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" />
        </Stack>
        {/* Phones only: "A new version of Function is ready", after an over-the-air update has downloaded. */}
        <UpdateBanner />
        {Platform.OS !== "web" && <LaunchSplash />}
      </SessionProvider>
    </QueryClientProvider>
  );
}
