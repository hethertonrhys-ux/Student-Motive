import { Platform, Text, View } from "react-native";
import { countryByCode, flagEmoji } from "@function/shared";
import { T } from "@/components/ui";

// A country flag next to someone's name. Kept as its own element (never
// joined into the name) so names stay clean in searches and notifications.
// Windows browsers can't draw flag emoji, so there it shows the code
// ("GB") in a small pill instead.
const noFlagFont = Platform.OS === "web" && typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

export function Flag({ code, size = 16, className = "", testID = "flag" }: { code: string | null | undefined; size?: number; className?: string; testID?: string }) {
  const country = countryByCode(code);
  if (!country) return null;
  if (noFlagFont) {
    return (
      <View className={`rounded border border-line px-1 ${className}`} accessibilityLabel={country.name} testID={testID}>
        <T variant="bold" style={{ fontSize: Math.max(9, size * 0.6) }}>{country.code}</T>
      </View>
    );
  }
  return (
    <Text className={className} style={{ fontSize: size, lineHeight: size + 4 }} accessibilityLabel={country.name} testID={testID}>
      {flagEmoji(country.code)}
    </Text>
  );
}
