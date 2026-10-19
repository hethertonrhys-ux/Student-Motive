import { Redirect } from "expo-router";
import { View } from "react-native";
import { Landing } from "@/components/landing";
import { useSession } from "@/providers/session";

// The front door. Logged in: straight to the map. Logged out: the landing
// page (the same words as the website's), with the map still one tap away.
export default function Index() {
  const { session, loading } = useSession();
  if (loading) return <View className="flex-1 bg-bg" />;
  if (session) return <Redirect href="/(tabs)/map" />;
  return <Landing />;
}
