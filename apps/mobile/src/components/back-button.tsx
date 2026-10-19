import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/icon";
import { T } from "@/components/ui";
import { useTheme } from "@/lib/theme";

// The back button every screen outside the tabs has at the top left (like
// Instagram's). Goes back if there's somewhere to go back to; otherwise
// (the page was opened from a link) it goes to `fallback`.
export function BackButton({ fallback = "/(tabs)/map", label = "Back", className = "", testID = "back" }: { fallback?: string; label?: string; className?: string; testID?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  function go() {
    if (router.canGoBack()) router.back();
    else router.replace(fallback as never);
  }
  return (
    <Pressable onPress={go} accessibilityRole="button" accessibilityLabel={label} testID={testID} hitSlop={8} className={`h-10 w-10 items-center justify-center rounded-full border border-line bg-surface active:opacity-80 ${className}`}>
      <Icon name="chevron-back" size={22} color={colors.ink} />
    </Pressable>
  );
}

// The back button with the screen's title next to it, and room for an
// action on the right.
export function ScreenHeader({ title, fallback, right, className = "" }: { title?: string; fallback?: string; right?: ReactNode; className?: string }) {
  return (
    <View className={`flex-row items-center gap-3 ${className}`}>
      <BackButton fallback={fallback} />
      {title ? <T variant="display-bold" className="flex-1 text-lg" numberOfLines={1}>{title}</T> : <View className="flex-1" />}
      {right}
    </View>
  );
}
