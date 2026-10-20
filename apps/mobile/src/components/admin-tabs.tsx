import { Link } from "expo-router";
import { Pressable, View } from "react-native";
import { T } from "@/components/ui";

// The admin panel's sections.
export type AdminSection = "overview" | "users" | "events" | "societies" | "hub";

export function AdminTabs({ current }: { current: AdminSection }) {
  return (
    <View className="mt-4 flex-row rounded-2xl border border-line bg-surface p-1" accessibilityRole="tablist">
      {([["overview", "Overview", "/admin"], ["users", "Users", "/admin/users"], ["events", "Events", "/admin/events"], ["societies", "Societies", "/admin/societies"], ["hub", "Hub", "/admin/hub"]] as const).map(([key, label, href]) => (
        <Link key={key} href={href as never} replace asChild>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: current === key }} className={`flex-1 items-center rounded-xl py-2.5 ${current === key ? "bg-brand" : ""}`} testID={`admin-tab-${key}`}>
            <T variant="bold" className={`text-sm ${current === key ? "text-brand-ink" : "text-muted"}`}>{label}</T>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}
