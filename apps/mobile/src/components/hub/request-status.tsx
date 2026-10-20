import { View } from "react-native";
import { featureRequestStatusLabel, type FeatureRequestStatus } from "@function/shared";
import { T } from "@/components/ui";

// Where a feature request is (New, Building, Live, Declined), as a small
// pill. Used in the Hub's Requests page and the admin panel.
const STYLE: Record<FeatureRequestStatus, { box: string; text: string }> = {
  new: { box: "bg-brand-soft", text: "text-brand" },
  building: { box: "border border-brand", text: "text-brand" },
  live: { box: "bg-ok/10", text: "text-ok" },
  declined: { box: "border border-line", text: "text-muted" },
};

export function RequestStatusPill({ status, testID }: { status: FeatureRequestStatus; testID?: string }) {
  const style = STYLE[status] ?? STYLE.new;
  return (
    <View className={`self-start rounded-full px-2.5 py-0.5 ${style.box}`} testID={testID}>
      <T variant="bold" className={`text-xs ${style.text}`}>{featureRequestStatusLabel(status)}</T>
    </View>
  );
}
