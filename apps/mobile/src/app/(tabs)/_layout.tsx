import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useColorScheme } from "react-native";
import { useNewNotifications, useUnreadMessages } from "@/lib/badges";

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
  const dark = useColorScheme() === "dark";
  // Unread messages on Chats; new notifications on Me.
  const unread = useUnreadMessages();
  const fresh = useNewNotifications();
  const badge = (name: string) => (name === "chats" && unread > 0 ? unread : name === "me" && fresh > 0 ? fresh : undefined);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: dark ? "#f0564a" : "#DA291C",
        tabBarInactiveTintColor: dark ? "#a3a2c2" : "#5e5d78",
        tabBarStyle: { backgroundColor: dark ? "#17162c" : "#ffffff", borderTopColor: dark ? "#2b2a48" : "#e3e2ef" },
        tabBarLabelStyle: { fontFamily: "Figtree_600SemiBold", fontSize: 11 },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarBadge: badge(tab.name),
            tabBarBadgeStyle: { backgroundColor: "#f43f5e", color: "#fff", fontFamily: "Figtree_700Bold", fontSize: 11 },
            tabBarIcon: ({ color, focused, size }) => <Ionicons name={focused ? tab.icon : (`${tab.icon}-outline` as const)} color={typeof color === "string" ? color : "#5e5d78"} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
