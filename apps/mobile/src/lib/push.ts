import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { removePushToken, savePushToken } from "@function/shared";
import { supabase } from "@/lib/supabase";

// Push notifications on this device. On iPhone and Android the app gets an
// Expo push token; on the web (the home-screen app) the browser gives a
// Web Push subscription, handled by public/sw.js. Either way the token is
// saved against the account so the server knows where to send things.

const ASKED_KEY = "fn-push-asked"; // the phone's own question has been shown on this device
const SOFT_KEY = "fn-push-soft"; // our own "turn on notifications?" asks: how many, and the last one
const TOKEN_KEY = "fn-push-token"; // the token saved for this device
const SAVED_AT_KEY = "fn-push-saved-at"; // when it was last saved
const RESAVE_AFTER_MS = 24 * 60 * 60 * 1000;
const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushStatus = "granted" | "denied" | "undetermined" | "unsupported";

// How the phone shows a notification while the app is open.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

function webSupported() {
  return Platform.OS === "web" && typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!VAPID_PUBLIC_KEY;
}

export async function getPushStatus(): Promise<PushStatus> {
  if (Platform.OS === "web") {
    if (!webSupported()) return "unsupported";
    const p = Notification.permission;
    return p === "granted" ? "granted" : p === "denied" ? "denied" : "undetermined";
  }
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
}

export const pushAsked = { get: async () => (await AsyncStorage.getItem(ASKED_KEY).catch(() => null)) === "1", set: () => AsyncStorage.setItem(ASKED_KEY, "1").catch(() => {}) };

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Ask for permission (if needed) and save this device's token. Returns the
// permission status afterwards.
export async function enablePush(userId: string): Promise<PushStatus> {
  await pushAsked.set();
  if (Platform.OS === "web") {
    if (!webSupported()) return "unsupported";
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission === "denied" ? "denied" : "undetermined";
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
    const r = await savePushToken(supabase, userId, sub.endpoint, "web", sub.toJSON());
    if (!r.error) await AsyncStorage.multiSet([[TOKEN_KEY, sub.endpoint], [SAVED_AT_KEY, String(Date.now())]]).catch(() => {});
    return "granted";
  }
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return status === "denied" ? "denied" : "undetermined";
  if (Platform.OS === "android") {
    // eslint-disable-next-line import/namespace -- AndroidImportance is re-exported by expo-notifications; the import plugin can't follow it
    await Notifications.setNotificationChannelAsync("default", { name: "Function", importance: Notifications.AndroidImportance.DEFAULT });
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return "unsupported"; // needs `eas init` (see docs/EXPO_LAUNCH.md)
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const r = await savePushToken(supabase, userId, token, Platform.OS === "ios" ? "ios" : "android");
  if (!r.error) await AsyncStorage.multiSet([[TOKEN_KEY, token], [SAVED_AT_KEY, String(Date.now())]]).catch(() => {});
  return "granted";
}

// Forget this device (e.g. on log out).
export async function disablePushOnThisDevice() {
  const token = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
  if (token) await removePushToken(supabase, token);
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
}

// Keep the saved token fresh when the app opens with permission already
// granted, and open the right screen when a notification is tapped.
export function usePushLifecycle(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    // A few seconds after launch (not in the way of the first screen), and
    // only if the saved token is more than a day old.
    const timer = setTimeout(() => {
      void (async () => {
        const savedAt = Number((await AsyncStorage.getItem(SAVED_AT_KEY).catch(() => null)) ?? 0);
        if (savedAt && Date.now() - savedAt < RESAVE_AFTER_MS) return;
        if ((await getPushStatus()) === "granted" && (await pushAsked.get())) await enablePush(userId);
      })();
    }, 5000);
    if (Platform.OS === "web") return () => clearTimeout(timer);
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === "string" && url.startsWith("/")) router.push(url as never);
    };
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    // A tap that launched the app happened before this listener existed.
    open(Notifications.getLastNotificationResponse());
    Notifications.clearLastNotificationResponse();
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [userId]);
}

// ---- When to ask ----
// iPhones only let an app show their "Allow notifications?" question once,
// and people say no by habit if it comes too early. So Function asks in its
// own words first, and the phone's question only comes after "Turn on":
// - the welcome: once, the first time someone reaches the map after
//   finishing sign-up (PushWelcome);
// - after "Not now", at a useful moment (joining an event, sending a friend
//   request, sending a message): at most once a week and 3 times in all.
// Nothing is asked once the phone's question has been answered.
export const SOFT_ASK_LIMIT = 3;
export const SOFT_ASK_GAP_MS = 7 * 24 * 60 * 60 * 1000;
type SoftAsks = { count: number; last: number };

async function softAsks(): Promise<SoftAsks> {
  try {
    const raw = await AsyncStorage.getItem(SOFT_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<SoftAsks>;
      return { count: Number(v.count) || 0, last: Number(v.last) || 0 };
    }
    // Before this, "Not now" on the old card was saved as asked: count it as one ask.
    if ((await AsyncStorage.getItem(ASKED_KEY)) === "1") return { count: 1, last: 0 };
  } catch {}
  return { count: 0, last: 0 };
}

async function recordSoftAsk() {
  const now = await softAsks();
  await AsyncStorage.setItem(SOFT_KEY, JSON.stringify({ count: now.count + 1, last: Date.now() })).catch(() => {});
}

// Whether our own ask may show now. "welcome" is the first one only.
export async function maySoftAsk(kind: "welcome" | "moment"): Promise<boolean> {
  if ((await getPushStatus()) !== "undetermined") return false;
  const { count, last } = await softAsks();
  if (kind === "welcome") return count === 0;
  return count < SOFT_ASK_LIMIT && Date.now() - last >= SOFT_ASK_GAP_MS;
}

// The "turn on notifications?" card at a useful moment (when "when" is
// true). Showing it counts as one ask, so it won't pop up again for a week.
export function usePushPrompt(when = true) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!when) return;
    let live = true;
    void (async () => {
      if (!(await maySoftAsk("moment")) || !live) return;
      await recordSoftAsk();
      if (live) setShow(true);
    })();
    return () => {
      live = false;
    };
  }, [when]);
  return { show, dismiss: () => setShow(false) };
}

// The welcome ask: whether to show it, and recording that it was shown.
export function usePushWelcome(ready: boolean) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    // A moment after the map appears, so they see what's on first.
    const timer = setTimeout(() => {
      void (async () => {
        if (!(await maySoftAsk("welcome")) || !live) return;
        await recordSoftAsk();
        if (live) setShow(true);
      })();
    }, 1500);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [ready]);
  return { show, close: () => setShow(false) };
}
