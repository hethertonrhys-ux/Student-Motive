import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { REPORT_REASONS, sendReport, type ReportTarget } from "@function/shared";
import { Icon } from "@/components/icon";
import { Button, Input, Label, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";

// Reporting something: pick a reason, add a note if you like, send. The
// report is saved and emailed to the Function team, who review it within
// 24 hours. `what` names it: "this message", "Cas", "this event".
export function ReportSheet({ target, what, onClose }: { target: ReportTarget | null; what: string; onClose: () => void }) {
  const { colors } = useTheme();
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setReason(null);
    setNote("");
    setState("idle");
    setError(null);
    onClose();
  }

  async function send() {
    if (!target) return;
    if (!reason) return setError("Choose a reason.");
    setState("sending");
    setError(null);
    const result = await sendReport(supabase, target, reason, note);
    if (result.error) {
      setState("idle");
      return setError(result.error);
    }
    setState("sent");
  }

  return (
    <Modal visible={!!target} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]} testID="report-sheet">
        <View className="mx-auto w-full max-w-md flex-1 px-4">
          <View className="flex-row items-center justify-between py-3">
            <T variant="headline" numberOfLines={1} className="flex-1">Report {what}</T>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} className="h-10 w-10 items-center justify-center rounded-full border border-line bg-surface active:opacity-80" testID="report-close">
              <Icon name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>
          {state === "sent" ? (
            <View className="items-center gap-3 py-10" testID="report-sent">
              <Icon name="checkmark-circle" size={48} color={colors.ok} />
              <T variant="title3" className="text-center">Thanks for telling us</T>
              <Muted className="max-w-xs text-center">The Function team will review this within 24 hours. If it breaks our rules, we&apos;ll remove it and may suspend or ban the account.</Muted>
              <Muted className="max-w-xs text-center text-sm">You can also block people from their profile or from a chat.</Muted>
              <Button className="mt-2" onPress={close} testID="report-done">Done</Button>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 pb-8">
              <Muted>Why are you reporting {what}? Reports are private: we don&apos;t tell anyone who reported them.</Muted>
              <View className="overflow-hidden rounded-2xl border border-line bg-surface" accessibilityRole="radiogroup">
                {REPORT_REASONS.map((r, i) => (
                  <Pressable key={r} onPress={() => setReason(r)} accessibilityRole="radio" accessibilityState={{ selected: reason === r }} className={`min-h-12 flex-row items-center gap-3 px-4 py-3 active:opacity-80 ${i > 0 ? "border-t border-line" : ""}`} testID={`reason-${i}`}>
                    <Icon name={reason === r ? "radio-button-on" : "radio-button-off"} size={22} color={reason === r ? colors.brand : colors.muted} />
                    <T variant="semibold" className="flex-1">{r}</T>
                  </Pressable>
                ))}
              </View>
              <View>
                <Label>Anything else? (optional)</Label>
                <Input value={note} onChangeText={setNote} multiline maxLength={2000} placeholder="What happened" className="min-h-24" style={{ textAlignVertical: "top" }} testID="report-note" />
              </View>
              {error && <T variant="semibold" className="text-sm text-danger" testID="report-error">{error}</T>}
              <Button onPress={() => void send()} disabled={state === "sending"} testID="report-send">{state === "sending" ? "Sending…" : "Send report"}</Button>
            </ScrollView>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
