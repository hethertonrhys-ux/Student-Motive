import { useState } from "react";
import { View } from "react-native";
import { Button, Muted, T } from "@/components/ui";
import { enablePush, usePushPrompt } from "@/lib/push";

// Shown once, right after someone joins their first event: a good moment
// to ask, rather than the second the app opens.
export function PushPromptCard({ userId }: { userId: string }) {
  const { show, dismiss } = usePushPrompt();
  const [state, setState] = useState<"idle" | "busy" | "done" | "denied">("idle");
  if (!show && state === "idle") return null;
  if (state === "done") return null;
  async function turnOn() {
    setState("busy");
    const status = await enablePush(userId);
    setState(status === "granted" ? "done" : "denied");
    if (status === "granted") dismiss();
  }
  return (
    <View className="mt-4 gap-2 rounded-2xl border border-line bg-brand-soft px-4 py-3" testID="push-prompt">
      <T variant="semibold">Want a nudge when it&apos;s starting?</T>
      <Muted className="text-sm">Turn on notifications for event reminders, messages and friend requests. You can change what you get at any time in Me → Notifications.</Muted>
      {state === "denied" && <Muted className="text-sm">Notifications are off for Function in your phone&apos;s settings. Turn them on there if you change your mind.</Muted>}
      <View className="flex-row gap-2">
        <Button className="py-2" onPress={() => void turnOn()} disabled={state === "busy"} testID="push-enable">{state === "busy" ? "Turning on…" : "Turn on"}</Button>
        <Button variant="ghost" className="py-2" onPress={dismiss} testID="push-later">Not now</Button>
      </View>
    </View>
  );
}
