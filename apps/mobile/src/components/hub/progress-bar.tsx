import { View } from "react-native";
import { T } from "@/components/ui";

// How far through the Hub's setup you are: "Step 3 of 8" and a bar in the
// brand colour.
export function ProgressBar({ step, total }: { step: number; total: number }) {
  const done = Math.max(0, Math.min(step, total));
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <View testID="hub-progress" accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: done, text: `Step ${done} of ${total}` }}>
      <T variant="semibold" className="text-sm text-muted">Step {done} of {total}</T>
      <View className="mt-2 h-2 overflow-hidden rounded-full bg-line">
        <View className="h-2 rounded-full bg-brand" style={{ width: `${percent}%` }} />
      </View>
    </View>
  );
}
