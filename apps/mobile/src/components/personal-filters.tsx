import { Pressable, View } from "react-native";
import { PERSONAL_FILTER_OPTIONS, type PersonalFilters } from "@function/shared";
import { Icon } from "@/components/icon";
import { T } from "@/components/ui";

// The two tick boxes that work the same everywhere events are listed:
// "Only events my friends are hosting" and "Only events from societies I'm
// a member of". Both ticked shows events that match either one. "only"
// shows just one of them (Social has the friends box, the society events
// page the societies box).
export function PersonalFilterBoxes({ filters, onChange, compact = false, only, testID = "personal" }: { filters: PersonalFilters; onChange: (next: PersonalFilters) => void; compact?: boolean; only?: keyof PersonalFilters; testID?: string }) {
  return (
    <View className={compact ? "gap-1" : "gap-1.5"} testID={testID}>
      {PERSONAL_FILTER_OPTIONS.filter((o) => !only || o.key === only).map((o) => {
        const on = filters[o.key];
        return (
          <Pressable key={o.key} onPress={() => onChange({ ...filters, [o.key]: !on })} accessibilityRole="checkbox" accessibilityState={{ checked: on }} aria-checked={on} testID={`${testID}-${o.key}`} className={`flex-row items-center gap-3 rounded-xl ${compact ? "px-1 py-1.5" : "px-2 py-2.5"}`}>
            <View className={`h-5 w-5 items-center justify-center rounded-md border ${on ? "border-brand bg-brand" : "border-line bg-surface"}`}>{on && <Icon name="checkmark" size={14} color="#fff" />}</View>
            <T variant="semibold" className="flex-1 text-sm">{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}
