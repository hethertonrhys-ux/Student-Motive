import { useState } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/icon";
import { Card, T } from "@/components/ui";
import { useTheme } from "@/lib/theme";

export type MoreItem = { label: string; onPress: () => void; danger?: boolean; icon?: React.ComponentProps<typeof Icon>["name"]; testID?: string };

// A ••• button that opens a short list of actions (report, block...) just
// under it. Tapping an action, or the button again, closes it.
export function MoreMenu({ items, label = "More options", testID = "more" }: { items: MoreItem[]; label?: string; testID?: string }) {
  const [open, setOpen] = useState(false);
  const { colors } = useTheme();
  if (items.length === 0) return null;
  return (
    <View className="z-10 items-end">
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open }} hitSlop={8} className="h-10 w-10 items-center justify-center rounded-full border border-line bg-surface active:opacity-80" testID={testID}>
        <Icon name="ellipsis-horizontal" size={20} color={colors.ink} />
      </Pressable>
      {open && (
        <Card className="absolute right-0 top-12 min-w-56 p-0" testID={`${testID}-menu`}>
          {items.map((item, i) => (
            <Pressable
              key={item.label}
              onPress={() => {
                setOpen(false);
                item.onPress();
              }}
              accessibilityRole="button"
              className={`min-h-12 flex-row items-center gap-3 px-4 active:opacity-80 ${i > 0 ? "border-t border-line" : ""}`}
              testID={item.testID}
            >
              {item.icon && <Icon name={item.icon} size={20} color={item.danger ? colors.danger : colors.ink} />}
              <T variant="semibold" className={item.danger ? "text-danger" : ""}>{item.label}</T>
            </Pressable>
          ))}
        </Card>
      )}
    </View>
  );
}
