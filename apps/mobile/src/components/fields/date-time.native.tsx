import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Modal, Platform, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "@/components/icon";
import { Button, T } from "@/components/ui";
import { useTheme } from "@/lib/theme";

// The phone's own date and time pickers. Values are "YYYY-MM-DD" and
// "HH:MM" in the phone's local time (students in London).
//
// On iPhone the calendar or clock opens in a panel across the bottom of the
// screen (full width, so nothing is cut off), with an arrow to close it and
// a Confirm button. Tapping outside it closes it too. Closing keeps what's
// showing, so opening the calendar on today's date and closing it picks
// today. Android uses its own pop-up, which already has OK and Cancel.
const pad = (n: number) => String(n).padStart(2, "0");
const toDate = (date: string) => (date ? new Date(`${date}T12:00:00`) : new Date());
const toTime = (time: string) => {
  const d = new Date();
  const [h, m] = time ? time.split(":").map(Number) : [19, 0];
  d.setHours(h, m, 0, 0);
  return d;
};
const dateLabel = (date: string) => (date ? toDate(date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "Pick a date");
const longDate = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
const format = (mode: "date" | "time", d: Date) => (mode === "date" ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : `${pad(d.getHours())}:${pad(d.getMinutes())}`);

function Picker({ mode, value, onChange, label, testID, accessibilityLabel }: { mode: "date" | "time"; value: string; onChange: (v: string) => void; label: string; testID?: string; accessibilityLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => (mode === "date" ? toDate(value) : toTime(value)));
  const { dark, colors } = useTheme();

  function show() {
    setDraft(mode === "date" ? toDate(value) : toTime(value));
    setOpen(true);
  }
  // Every way of closing keeps what's showing.
  function close() {
    onChange(format(mode, draft));
    setOpen(false);
  }

  const field = (
    <Pressable onPress={show} accessibilityRole="button" accessibilityLabel={accessibilityLabel} testID={testID} className="min-h-11 justify-center rounded-xl border border-line bg-surface px-3.5 py-2.5">
      <T className={value ? "" : "text-muted"}>{label}</T>
    </Pressable>
  );

  if (Platform.OS !== "ios") {
    return (
      <>
        {field}
        {open && (
          <DateTimePicker
            value={draft}
            mode={mode}
            display="default"
            onChange={(event, picked) => {
              setOpen(false);
              if (event.type === "dismissed" || !picked) return;
              onChange(format(mode, picked));
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      {field}
      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <View className="flex-1 justify-end">
          {/* Tap anywhere above the panel to close it. */}
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" className="absolute inset-0 bg-black/30" testID={testID ? `${testID}-outside` : undefined} />
          <SafeAreaView edges={["bottom"]} className="rounded-t-3xl border-t border-line bg-surface">
            <View className="mx-auto w-full max-w-md px-4 pb-3 pt-2" testID={testID ? `${testID}-panel` : undefined}>
              <View className="flex-row items-center justify-between gap-3 py-1">
                <View className="min-w-0 flex-1">
                  <T variant="footnote" className="font-sans-semibold text-muted">{accessibilityLabel ?? (mode === "date" ? "Date" : "Time")}</T>
                  <T variant="headline" numberOfLines={1}>{mode === "date" ? longDate(draft) : format("time", draft)}</T>
                </View>
                <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={mode === "date" ? "Close the calendar" : "Close the clock"} hitSlop={10} className="h-11 w-11 items-center justify-center rounded-full border border-line bg-bg active:opacity-80" testID={testID ? `${testID}-collapse` : undefined}>
                  <Icon name="chevron-up" size={22} color={colors.ink} />
                </Pressable>
              </View>
              <DateTimePicker
                value={draft}
                mode={mode}
                display={mode === "date" ? "inline" : "spinner"}
                themeVariant={dark ? "dark" : "light"}
                accentColor={colors.brand}
                onChange={(_event, picked) => {
                  if (picked) setDraft(picked);
                }}
                style={mode === "time" ? { alignSelf: "center" } : undefined}
              />
              <Button onPress={close} className="mt-1" testID={testID ? `${testID}-confirm` : undefined}>Confirm</Button>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

export function DateField(props: { value: string; onChange: (value: string) => void; testID?: string; accessibilityLabel?: string }) {
  return <Picker mode="date" label={dateLabel(props.value)} {...props} />;
}

export function TimeField(props: { value: string; onChange: (value: string) => void; testID?: string; accessibilityLabel?: string }) {
  return <Picker mode="time" label={props.value || "Pick a time"} {...props} />;
}
