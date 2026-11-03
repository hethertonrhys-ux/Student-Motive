import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, Tabs, usePathname } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PushWelcome } from "@/components/push-welcome";
import { TabAvatar } from "@/components/tab-avatar";
import { HOME_ROUTE, MAP_ENABLED } from "@/lib/app-features";
import { useNewNotifications, useUnreadMessages } from "@/lib/badges";
import { useProfile } from "@/lib/profile";
import { useTheme } from "@/lib/theme";

// The tabs, the same as the website's bottom bar: Map, Societies, Social,
// Chats, Me. The Map tab only shows while the map is switched on
// (lib/app-features.ts).
const ALL_TABS = [
  { name: "map", title: "Map", icon: "location" },
  { name: "societies", title: "Societies", icon: "people" },
  { name: "social", title: "Social", icon: "person-add" },
  { name: "chats", title: "Chats", icon: "chatbubble-ellipses" },
  { name: "me", title: "Me", icon: "person-circle" },
] as const;
const TABS = ALL_TABS.filter((tab) => MAP_ENABLED || tab.name !== "map");

export default function TabsLayout() {
  const { colors } = useTheme();
  const web = Platform.OS === "web";
  // On the web the page's own CSS variables colour the bar, so it's right
  // in dark mode even before the app has started.
  const tone = (token: string, value: string) => (web ? `var(--${token})` : value);
  // The bar sits above the home indicator (iPhones with curved screens):
  // its height grows by the bottom safe-area inset, and never less than 6px.
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 6);
  // Unread messages on Chats; new notifications on Me.
  const unread = useUnreadMessages();
  const fresh = useNewNotifications();
  // Your photo stands in for the Me icon.
  const { profile } = useProfile();
  const pathname = usePathname();
  const badge = (name: string) => (name === "chats" && unread > 0 ? unread : name === "me" && fresh > 0 ? fresh : undefined);
  // With the map switched off, an old link or bookmark to it opens the home tab instead.
  if (!MAP_ENABLED && pathname === "/map") return <Redirect href={HOME_ROUTE} />;
  return (
    <>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tone("brand", colors.brand),
        tabBarInactiveTintColor: tone("muted", colors.muted),
        // 49 is the bar's usual height; the inset is added on top so the icons and labels keep their room.
        tabBarStyle: { backgroundColor: tone("surface", colors.surface), borderTopColor: tone("line", colors.line), height: 49 + bottom, paddingBottom: bottom },
        tabBarLabelStyle: { fontWeight: "600", fontSize: 11 },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarBadge: badge(tab.name),
            tabBarBadgeStyle: { backgroundColor: colors.brand, color: "#fff", fontWeight: "700", fontSize: 11 },
            tabBarIcon: ({ color, focused, size }) => {
              const tint = typeof color === "string" ? color : colors.muted;
              if (tab.name === "me") return <TabAvatar url={profile?.avatar_url} focused={focused} color={tint} size={size} />;
              return <Ionicons name={focused ? tab.icon : (`${tab.icon}-outline` as const)} color={tint} size={size} />;
            },
          }}
        />
      ))}
      {/* The map's screen file is still here, so it's listed with no tab button. It's
          last, so Back on Android never lands on it. */}
      {MAP_ENABLED ? [] : [<Tabs.Screen key="map" name="map" options={{ href: null }} />]}
    </Tabs>
    {/* "Don't miss what's on tonight": the notifications ask, once, on the home tab after sign-up. */}
    <PushWelcome />
    </>
  );
}
