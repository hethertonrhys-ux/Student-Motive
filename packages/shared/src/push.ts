import type { SupabaseClient } from "@supabase/supabase-js";

// Push notifications: what each person wants to hear about, and where to
// send it. The sending itself happens on the server (the send-push edge
// function), fed by database triggers; the app only keeps these settings.

export type NotificationKind = "messages" | "friends" | "society_events" | "reminders" | "hosting" | "seating";
export type NotificationSettings = Record<NotificationKind, boolean>;

export const NOTIFICATION_KINDS: { key: NotificationKind; title: string; detail: string }[] = [
  { key: "messages", title: "Messages", detail: "When someone messages you, or posts in an event chat you're in." },
  { key: "friends", title: "Friend requests", detail: "When someone adds you, or accepts your request." },
  { key: "society_events", title: "Society events", detail: "When a society you're a member of posts a new event." },
  { key: "reminders", title: "Starting soon", detail: "Half an hour before an event you've joined starts." },
  { key: "hosting", title: "Your events", detail: "When someone joins, or asks to join, an event you're hosting." },
  { key: "seating", title: "Poker seating", detail: "When the committee reshuffles your table and you get a new seat." },
];

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = { messages: true, friends: true, society_events: true, reminders: true, hosting: true, seating: true };

export async function loadNotificationSettings(supabase: SupabaseClient, myId: string): Promise<NotificationSettings> {
  const { data } = await supabase.from("notification_settings").select("messages, friends, society_events, reminders, hosting, seating").eq("user_id", myId).maybeSingle();
  return { ...DEFAULT_NOTIFICATION_SETTINGS, ...((data as Partial<NotificationSettings> | null) ?? {}) };
}

export async function saveNotificationSettings(supabase: SupabaseClient, myId: string, settings: NotificationSettings): Promise<{ error?: string }> {
  const { error } = await supabase.from("notification_settings").upsert({ user_id: myId, ...settings, updated_at: new Date().toISOString() });
  return error ? { error: "Couldn't save. Please try again." } : {};
}

// Remember a phone or browser that has allowed notifications. The device
// is claimed for whoever is logged in now, even if someone else used it
// before (see the push_token_handover migration). `myId` is kept so callers
// don't change; the database uses the logged-in user.
export async function savePushToken(supabase: SupabaseClient, _myId: string, token: string, platform: "ios" | "android" | "web", subscription: unknown = null): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("claim_push_token", { p_token: token, p_platform: platform, p_subscription: subscription });
  return error ? { error: error.message } : {};
}

export async function removePushToken(supabase: SupabaseClient, token: string) {
  await supabase.from("push_tokens").delete().eq("token", token);
}

// Does this person have at least one phone or browser set up for pushes?
export async function hasPushDevice(supabase: SupabaseClient, myId: string): Promise<boolean> {
  const { count } = await supabase.from("push_tokens").select("id", { count: "exact", head: true }).eq("user_id", myId);
  return (count ?? 0) > 0;
}
