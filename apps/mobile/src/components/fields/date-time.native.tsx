import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable } from "react-native";
import { T } from "@/components/ui";

// The phone's own date and time pickers. Values are "YYYY-MM-DD" and
// "HH:MM" in the phone's local time (students in London).
const pad = (n: number) => String(n).padStart(2, "0");
const toDate = (date: string) => (date ? new Date(`${date}T12:00:00`) : new Date());
const toTime = (time: string) => {
  const d = new Date();
  const [h, m] = time ? time.split(":").map(Number) : [19, 0];
  d.setHours(h, m, 0, 0);
  return d;
};
const dateLabel = (date: string) => (date ? toDate(date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "Pick a date");

function Picker({ mode, value, onChange, label, testID, accessibilityLabel }: { mode: "date" | "time"; value: string; onChange: (v: string) => void; label: string; testID?: string; accessibilityLabel?: string }) {
  const [open, setOpen] = useState(false);
  const current = mode === "date" ? toDate(value) : toTime(value);
  const picker = (
    <DateTimePicker
      value={current}
      mode={mode}
      display={Platform.OS === "ios" ? (mode === "date" ? "inline" : "spinner") : "default"}
      onChange={(event, picked) => {
        if (Platform.OS === "android") setOpen(false);
        if (event.type === "dismissed" || !picked) return;
        onChange(mode === "date" ? `${picked.getFullYear()}-${pad(picked.getMonth() + 1)}-${pad(picked.getDate())}` : `${pad(picked.getHours())}:${pad(picked.getMinutes())}`);
      }}
    />
  );
  return (
    <>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityLabel={accessibilityLabel} testID={testID} className="min-h-11 justify-center rounded-xl border border-line bg-surface px-3.5 py-2.5">
        <T className={value ? "" : "text-muted"}>{label}</T>
      </Pressable>
      {open && picker}
    </>
  );
}

export function DateField(props: { value: string; onChange: (value: string) => void; testID?: string; accessibilityLabel?: string }) {
  return <Picker mode="date" label={dateLabel(props.value)} {...props} />;
}

export function TimeField(props: { value: string; onChange: (value: string) => void; testID?: string; accessibilityLabel?: string }) {
  return <Picker mode="time" label={props.value || "Pick a time"} {...props} />;
}
