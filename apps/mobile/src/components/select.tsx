import { useState } from "react";
import { Keyboard, Modal, Pressable, ScrollView, View } from "react-native";
import { Icon } from "@/components/icon";
import { Input, Muted, T } from "@/components/ui";

export type Option = { value: string; label: string; group?: string };

// A drop-down that works the same on the web and the phone: tap it, pick
// from a list. Groups show as headings. `searchable` adds a search box at
// the top for long lists (countries); `search` can narrow the list its own
// way (e.g. "UK" finding the United Kingdom).
export function Select({ value, options, onChange, placeholder = "Choose…", accessibilityLabel, testID, className = "", searchable = false, search, emptyValueLabel }: { value: string; options: Option[]; onChange: (value: string) => void; placeholder?: string; accessibilityLabel?: string; testID?: string; className?: string; searchable?: boolean; search?: (query: string, options: Option[]) => Option[]; emptyValueLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const shown = !searchable || !q ? options : search ? search(query, options) : options.filter((o) => o.label.toLowerCase().includes(q));
  const groups = [...new Set(shown.map((o) => o.group ?? ""))];
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  // Put the keyboard away first (this also takes the focus off the box being
  // typed in). Otherwise, on iPhone, closing the list gives that box its
  // focus back, and the page scrolls back up to it.
  const openList = () => {
    Keyboard.dismiss();
    setOpen(true);
  };
  return (
    <>
      <Pressable onPress={openList} accessibilityRole="combobox" accessibilityLabel={accessibilityLabel} testID={testID} className={`min-h-11 flex-row items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 ${className}`}>
        <T className={`flex-1 ${current ? "" : "text-muted"}`} numberOfLines={1}>{current?.label ?? placeholder}</T>
        <Icon name="chevron-down" size={18} color="#5e5d78" />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={close}>
          <Pressable className="max-h-[70%] rounded-t-3xl bg-surface p-3 pb-8" onPress={(e) => e.stopPropagation()}>
            {searchable && <Input value={query} onChangeText={setQuery} placeholder="Search…" autoCapitalize="none" autoCorrect={false} autoFocus className="mb-2" accessibilityLabel={accessibilityLabel ? `Search ${accessibilityLabel}` : "Search"} testID={testID ? `${testID}-search` : undefined} />}
            {emptyValueLabel !== undefined && !q && (
              <Pressable onPress={() => { onChange(""); close(); }} accessibilityRole="menuitem" testID={testID ? `${testID}-none` : undefined} className={`flex-row items-center justify-between rounded-xl px-3 py-3 ${value === "" ? "bg-brand-soft" : ""}`}>
                <Muted>{emptyValueLabel}</Muted>
                {value === "" && <Icon name="checkmark" size={18} color="#DA291C" />}
              </Pressable>
            )}
            <ScrollView testID={testID ? `${testID}-options` : undefined} keyboardShouldPersistTaps="handled">
              {groups.map((g) => (
                <View key={g}>
                  {g ? <Muted className="px-3 pb-1 pt-3 text-xs font-sans-semibold uppercase">{g}</Muted> : null}
                  {shown
                    .filter((o) => (o.group ?? "") === g)
                    .map((o) => (
                      <Pressable
                        key={o.value}
                        onPress={() => {
                          onChange(o.value);
                          close();
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
              {searchable && shown.length === 0 && <Muted className="px-3 py-3">Nothing matches &ldquo;{query.trim()}&rdquo;.</Muted>}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
