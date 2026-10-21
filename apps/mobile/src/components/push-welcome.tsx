import { usePathname } from "expo-router";
import { useState } from "react";
import { Modal, Platform, View } from "react-native";
import { accountDetailsMissing } from "@function/shared";
import { Icon } from "@/components/icon";
import { Button, Muted, T } from "@/components/ui";
import { useDevice } from "@/lib/install";
import { useProfile } from "@/lib/profile";
import { enablePush, usePushWelcome } from "@/lib/push";

const PERKS: { icon: React.ComponentProps<typeof Icon>["name"]; text: string }[] = [
  { icon: "alarm-outline", text: "A reminder before events you're going to" },
  { icon: "chatbubble-ellipses-outline", text: "Messages from friends and your group chats" },
  { icon: "person-add-outline", text: "Friend requests, and invites to plans" },
];

// "Don't miss what's on tonight": Function's own ask to turn notifications
// on, shown once, the first time someone reaches the map after finishing
// sign-up. The phone's own question only comes after "Turn on" (see
// lib/push.ts for when Function asks again after "Not now").
// Phones, and the website when it's opened from the home screen.
export function PushWelcome() {
  const { profile } = useProfile();
  const pathname = usePathname();
  const device = useDevice();
  const canPush = Platform.OS !== "web" || !!device?.installed;
  const ready = !!profile && !accountDetailsMissing(profile) && pathname === "/map" && canPush;
  const { show, close } = usePushWelcome(ready);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);

  async function turnOn() {
    if (!profile) return;
    setBusy(true);
    const status = await enablePush(profile.id).catch(() => "undetermined" as const);
    setBusy(false);
    if (status === "granted") return close();
    setRefused(true);
  }

  return (
    <Modal visible={show} transparent animationType="fade" onRequestClose={close}>
      <View className="flex-1 items-center justify-center bg-black/50 px-4">
        <View className="w-full max-w-sm gap-4 rounded-3xl border border-line bg-surface p-6" testID="push-welcome">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft">
            <Icon name="notifications" size={30} color="#DA291C" />
          </View>
          <View className="gap-1">
            <T variant="title2">Don&apos;t miss what&apos;s on tonight</T>
            <Muted>Turn on notifications and Function will let you know about:</Muted>
          </View>
          <View className="gap-2.5">
            {PERKS.map((p) => (
              <View key={p.icon} className="flex-row items-center gap-3">
                <Icon name={p.icon} size={20} color="#DA291C" />
                <T className="flex-1 text-[15px]">{p.text}</T>
              </View>
            ))}
          </View>
          <Muted className="text-xs">You choose what you get in Me → Notification settings, and can turn them off at any time.</Muted>
          {refused ? (
            <>
              <Muted className="text-sm" testID="push-welcome-refused">
                {Platform.OS === "web" ? "Notifications are off for Function in this browser. You can turn them on in its settings later." : "Notifications are off for now. You can turn them on any time in Settings → Function → Notifications."}
              </Muted>
              <Button onPress={close} testID="push-welcome-done">OK</Button>
            </>
          ) : (
            <View className="gap-2">
              <Button onPress={() => void turnOn()} disabled={busy} testID="push-welcome-on">{busy ? "Turning on…" : "Turn on notifications"}</Button>
              <Button variant="ghost" onPress={close} disabled={busy} testID="push-welcome-later">Not now</Button>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
