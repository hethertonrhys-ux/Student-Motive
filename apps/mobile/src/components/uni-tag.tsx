import { View } from "react-native";
import { uniById } from "@function/shared";
import { T } from "@/components/ui";

// The small university tag on profiles ("LSE", "King's"), in the uni's
// accent colour.
export function UniTag({ id, size = "sm", testID }: { id: string | null | undefined; size?: "sm" | "md"; testID?: string }) {
  const uni = uniById(id);
  if (!uni) return null;
  return (
    <View className={`self-start rounded-full border ${size === "md" ? "px-3 py-1" : "px-2 py-0.5"}`} style={{ borderColor: uni.accent, backgroundColor: `${uni.accent}1a` }} testID={testID ?? `uni-tag-${uni.id}`}>
      <T variant="bold" className={size === "md" ? "text-sm" : "text-[11px]"} style={{ color: uni.accent }}>{uni.short}</T>
    </View>
  );
}
