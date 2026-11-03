import { Redirect } from "expo-router";
import { View } from "react-native";
import { Landing } from "@/components/landing";
import { HOME_ROUTE } from "@/lib/app-features";
import { useSession } from "@/providers/session";

// The front door. Logged in: straight to the home tab (the map, or Societies
// while the map is switched off; see lib/app-features.ts). Logged out: the
// landing page (the same words as the website's).
export default function Index() {
  const { session, loading } = useSession();
  if (loading) return <View className="flex-1 bg-bg" />;
  if (session) return <Redirect href={HOME_ROUTE} />;
  return <Landing />;
}
