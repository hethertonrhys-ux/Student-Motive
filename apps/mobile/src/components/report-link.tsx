import { useState } from "react";
import { Pressable, View } from "react-native";
import { Button, Input, Muted, T } from "@/components/ui";

// "Report this event": a quiet link that opens a reason box. Used for
// society events and Social plans alike.
export function ReportLink({ send }: { send: (reason: string) => Promise<{ error?: string }> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (done) return <Muted className="text-sm">Thanks. The Function team will take a look.</Muted>;
  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} testID="report">
        <T variant="semibold" className="text-sm text-muted">Report this event</T>
      </Pressable>
    );
  }
  return (
    <View className="w-full gap-2">
      <Input value={reason} onChangeText={setReason} placeholder="Why are you reporting this event?" maxLength={200} testID="report-reason" />
      <View className="flex-row gap-2">
        <Button
          className="py-2"
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            const r = await send(reason);
            setBusy(false);
            if (r.error) setError(r.error);
            else setDone(true);
          }}
          testID="send-report"
        >
          Send report
        </Button>
        <Button variant="ghost" className="py-2" onPress={() => setOpen(false)}>Cancel</Button>
      </View>
      {error && <T variant="semibold" className="text-sm text-danger">{error}</T>}
    </View>
  );
}
