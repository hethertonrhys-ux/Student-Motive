import { useState } from "react";
import { View } from "react-native";
import { Button, Muted, T } from "@/components/ui";
import { enablePush, usePushPrompt } from "@/lib/push";

// "Turn on notifications?" at a useful moment: after joining an event,
// sending a friend request or sending a message. lib/push.ts decides how
// often (at most once a week, 3 times in all, never once the phone's own
// question has been answered).
const WHY = {
  event: { title: "Want a nudge when it's starting?", body: "Turn on notifications for event reminders, messages and friend requests." },
  friend: { title: "Want to know when they accept?", body: "Turn on notifications for friend requests, messages and event reminders." },
  message: { title: "Want to know when they reply?", body: "Turn on notifications for messages, friend requests and event reminders." },
};

export function PushPromptCard({ userId, why = "event", className = "mt-4" }: { userId: string; why?: keyof typeof WHY; className?: string }) {
  const { show, dismiss } = usePushPrompt();
  const [state, setState] = useState<"idle" | "busy" | "done" | "denied">("idle");
  if (!show && state === "idle") return null;
  if (state === "done") return null;
  async function turnOn() {
    setState("busy");
    try {
      const status = await enablePush(userId);
      setState(status === "granted" ? "done" : "denied");
      if (status === "granted") dismiss();
    } catch {
      setState("denied");
    }
  }
  return (
    <View className={`gap-2 rounded-2xl border border-line bg-brand-soft px-4 py-3 ${className}`} testID="push-prompt">
      <T variant="semibold">{WHY[why].title}</T>
      <Muted className="text-sm">{WHY[why].body} You can change what you get at any time in Me → Notification settings.</Muted>
      {state === "denied" && <Muted className="text-sm">Couldn&apos;t turn notifications on here. If they&apos;re off for Function in your phone&apos;s settings, turn them on there; otherwise try again later from Me → Notification settings.</Muted>}
      <View className="flex-row gap-2">
        <Button className="py-2" onPress={() => void turnOn()} disabled={state === "busy"} testID="push-enable">{state === "busy" ? "Turning on…" : "Turn on"}</Button>
        <Button variant="ghost" className="py-2" onPress={dismiss} testID="push-later">Not now</Button>
      </View>
    </View>
  );
}
