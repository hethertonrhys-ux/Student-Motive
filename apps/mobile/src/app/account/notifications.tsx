import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { loadNotificationSettings, NOTIFICATION_KINDS, saveNotificationSettings, type NotificationKind, type NotificationSettings } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { Icon } from "@/components/icon";
import { Button, Card, Heading, Muted, T } from "@/components/ui";
import { enablePush, getPushStatus, type PushStatus } from "@/lib/push";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// Notification settings: whether this device gets pushes at all, and which
// kinds you want. Each switch saves straight away.
export default function NotificationSettingsScreen() {
  const { session } = useSession();
  const myId = session?.user.id ?? null;
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["notification-settings", myId], queryFn: () => loadNotificationSettings(supabase, myId!), enabled: !!myId });
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void getPushStatus().then(setStatus);
  }, []);

  async function toggle(kind: NotificationKind) {
    if (!myId || !settings.data) return;
    const next: NotificationSettings = { ...settings.data, [kind]: !settings.data[kind] };
    queryClient.setQueryData(["notification-settings", myId], next);
    const r = await saveNotificationSettings(supabase, myId, next);
    if (r.error) {
      setError(r.error);
      queryClient.setQueryData(["notification-settings", myId], settings.data);
    } else setError(null);
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-xl px-4 py-10">
        <BackButton fallback="/(tabs)/me" className="mb-4" />
        <Heading>Notifications</Heading>
        <Muted className="mt-1">Choose what Function tells you about.</Muted>
        {!myId ? (
          <Card className="mt-6 flex-row flex-wrap items-center justify-between gap-3">
            <T variant="semibold">Log in to change your notifications.</T>
            <Link href={{ pathname: "/login", params: { next: "/account/notifications" } }} asChild>
              <Button>Log in</Button>
            </Link>
          </Card>
        ) : (
          <>
            <Card className="mt-6 gap-2" testID="push-device">
              <T variant="semibold">On this device</T>
              {status === "granted" && <Muted className="text-sm">Notifications are on. ✓</Muted>}
              {status === "denied" && (
                <View className="gap-2" testID="push-denied">
                  <Muted className="text-sm">{Platform.OS === "web" ? "Notifications are off for Function in this browser's settings. Turn them on there to get pushes." : "Notifications are off for Function. Turn them on in Settings → Function → Notifications."}</Muted>
                  {Platform.OS !== "web" && <Button variant="ghost" className="self-start py-2" onPress={() => void Linking.openSettings()} testID="open-settings">Open Settings</Button>}
                </View>
              )}
              {status === "unsupported" && <Muted className="text-sm">This browser can&apos;t receive notifications. Add Function to your home screen (Me → Get the app) or use the Function app.</Muted>}
              {status === "undetermined" && (
                <View className="flex-row flex-wrap items-center justify-between gap-3">
                  <Muted className="flex-1 text-sm">You haven&apos;t turned notifications on here yet.</Muted>
                  <Button className="py-2" onPress={() => void enablePush(myId).then(setStatus).catch(() => setPushError("Couldn't turn notifications on here right now. Try again later."))} testID="push-enable">Turn on</Button>
                </View>
              )}
              {pushError && <T variant="semibold" className="text-sm text-danger">{pushError}</T>}
            </Card>
            <Card className="mt-6 gap-1" testID="notification-kinds">
              {NOTIFICATION_KINDS.map((k, i) => {
                const on = settings.data?.[k.key] ?? true;
                return (
                  <Pressable key={k.key} onPress={() => void toggle(k.key)} accessibilityRole="switch" accessibilityState={{ checked: on }} aria-checked={on} disabled={!settings.data} className={`flex-row items-center justify-between gap-4 py-3 ${i > 0 ? "border-t border-line" : ""}`} testID={`notify-${k.key}`}>
                    <View className="flex-1">
                      <T variant="semibold">{k.title}</T>
                      <Muted className="text-sm">{k.detail}</Muted>
                    </View>
                    <View className={`h-7 w-12 justify-center rounded-full px-0.5 ${on ? "bg-brand" : "bg-line"}`}>
                      <View className={`h-6 w-6 items-center justify-center rounded-full bg-white ${on ? "self-end" : "self-start"}`}>{on && <Icon name="checkmark" size={14} color="#DA291C" />}</View>
                    </View>
                  </Pressable>
                );
              })}
              {error && <T variant="semibold" className="pt-2 text-sm text-danger">{error}</T>}
            </Card>
            <Muted className="mt-4 text-xs">Reminders come about 30 minutes before an event starts. Society event alerts cover the societies you&apos;re an approved member of.</Muted>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
