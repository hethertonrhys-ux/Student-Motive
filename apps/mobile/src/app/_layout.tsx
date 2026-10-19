import "../global.css";
import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque";
import { Figtree_400Regular, Figtree_600SemiBold, Figtree_700Bold } from "@expo-google-fonts/figtree";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FontDisplay, useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { AccountGate } from "@/components/account-gate";
import { PushLifecycle } from "@/components/push-lifecycle";
import { SessionProvider } from "@/providers/session";

SplashScreen.preventAutoHideAsync();

// Reads are cached for a minute, like the website's cached tabs, so going
// back to a screen is instant.
// refetchOnWindowFocus is off: coming back to the app used to refetch every
// cached query at once; now the screen you're looking at refreshes itself
// (useRefetchOnFocus) and the others refresh when you open them.
const [queryClient] = [new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } } })];

// On the web the page shows straight away in a fallback font and swaps to
// ours when they've downloaded; on phones the splash screen waits for them.
const web = Platform.OS === "web";
const font = (source: number) => (web ? { uri: source, display: FontDisplay.SWAP } : source);

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Figtree_400Regular: font(Figtree_400Regular),
    Figtree_600SemiBold: font(Figtree_600SemiBold),
    Figtree_700Bold: font(Figtree_700Bold),
    BricolageGrotesque_700Bold: font(BricolageGrotesque_700Bold),
    BricolageGrotesque_800ExtraBold: font(BricolageGrotesque_800ExtraBold),
  });
  const [client] = useState(queryClient);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);
  if (!fontsLoaded && !web) return null;

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
      </SessionProvider>
    </QueryClientProvider>
  );
}
