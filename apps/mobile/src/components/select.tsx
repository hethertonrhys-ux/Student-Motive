import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Icon } from "@/components/icon";
import { Muted, T } from "@/components/ui";

export type Option = { value: string; label: string; group?: string };

// A drop-down that works the same on the web and the phone: tap it, pick
// from a list. Groups show as headings.
export function Select({ value, options, onChange, placeholder = "Choose…", accessibilityLabel, testID, className = "" }: { value: string; options: Option[]; onChange: (value: string) => void; placeholder?: string; accessibilityLabel?: string; testID?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="combobox" accessibilityLabel={accessibilityLabel} testID={testID} className={`min-h-11 flex-row items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 ${className}`}>
        <T className={`flex-1 ${current ? "" : "text-muted"}`} numberOfLines={1}>{current?.label ?? placeholder}</T>
        <Icon name="chevron-down" size={18} color="#5e5d78" />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setOpen(false)}>
          <Pressable className="max-h-[70%] rounded-t-3xl bg-surface p-3 pb-8" onPress={(e) => e.stopPropagation()}>
            <ScrollView testID={testID ? `${testID}-options` : undefined}>
              {groups.map((g) => (
                <View key={g}>
                  {g ? <Muted className="px-3 pb-1 pt-3 text-xs font-sans-semibold uppercase">{g}</Muted> : null}
                  {options
                    .filter((o) => (o.group ?? "") === g)
                    .map((o) => (
                      <Pressable
                        key={o.value}
                        onPress={() => {
                          onChange(o.value);
                          setOpen(false);
                        }}
                        accessibilityRole="menuitem"
                        testID={testID ? `${testID}-${o.value}` : undefined}
                        className={`flex-row items-center justify-between rounded-xl px-3 py-3 ${o.value === value ? "bg-brand-soft" : ""}`}
                      >
                        <T variant={o.value === value ? "semibold" : "normal"}>{o.label}</T>
                        {o.value === value && <Icon name="checkmark" size={18} color="#DA291C" />}
                      </Pressable>
                    ))}
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
