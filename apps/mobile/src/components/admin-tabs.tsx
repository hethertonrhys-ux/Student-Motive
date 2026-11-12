import { Link } from "expo-router";
import { Pressable, useWindowDimensions, View } from "react-native";
import { T } from "@/components/ui";

// The admin panel's sections. On a phone they wrap onto two rows of three,
// so each name fits.
export type AdminSection = "overview" | "users" | "events" | "societies" | "hub" | "communities";

const TABS = [
  ["overview", "Overview", "/admin"],
  ["users", "Users", "/admin/users"],
  ["events", "Events", "/admin/events"],
  ["societies", "Societies", "/admin/societies"],
  ["hub", "Hub", "/admin/hub"],
  ["communities", "Communities", "/admin/communities"],
] as const;

export function AdminTabs({ current }: { current: AdminSection }) {
  const { width } = useWindowDimensions();
  const narrow = width < 600;
  return (
    <View className={`mt-4 flex-row rounded-2xl border border-line bg-surface p-1 ${narrow ? "flex-wrap" : ""}`} accessibilityRole="tablist">
      {TABS.map(([key, label, href]) => (
        <Link key={key} href={href as never} replace asChild>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: current === key }} className={`items-center rounded-xl py-2.5 ${narrow ? "w-1/3" : "flex-1"} ${current === key ? "bg-brand" : ""}`} testID={`admin-tab-${key}`}>
            <T variant="bold" className={`text-sm ${current === key ? "text-brand-ink" : "text-muted"}`} numberOfLines={1}>{label}</T>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}
