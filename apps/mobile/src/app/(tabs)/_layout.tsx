import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabAvatar } from "@/components/tab-avatar";
import { useNewNotifications, useUnreadMessages } from "@/lib/badges";
import { useProfile } from "@/lib/profile";
import { useTheme } from "@/lib/theme";

// The five tabs, the same as the website's bottom bar: Map, Societies,
// Social, Chats, Me.
const TABS = [
  { name: "map", title: "Map", icon: "location" },
  { name: "societies", title: "Societies", icon: "people" },
  { name: "social", title: "Social", icon: "person-add" },
  { name: "chats", title: "Chats", icon: "chatbubble-ellipses" },
  { name: "me", title: "Me", icon: "person-circle" },
] as const;

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
  const badge = (name: string) => (name === "chats" && unread > 0 ? unread : name === "me" && fresh > 0 ? fresh : undefined);
  return (
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
    </Tabs>
  );
}
