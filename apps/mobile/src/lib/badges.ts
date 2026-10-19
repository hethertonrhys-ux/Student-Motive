import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { getNotificationTimes, getUnreadCount } from "@function/shared";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// The little red numbers: unread messages on the Chats tab, new
// notifications on the Me tab. Checked every minute and when you come
// back to the app.

const SEEN_KEY = "fn-notifications-seen"; // when you last opened Notifications
const FIRST_LOOK_DAYS = 3; // on a phone that's never opened Notifications, the last few days count as new

export function useUnreadMessages() {
  const { session } = useSession();
  const query = useQuery({ queryKey: ["unread", session?.user.id ?? null], queryFn: () => getUnreadCount(supabase), enabled: !!session, refetchInterval: 60_000 });
  useRefetchOnForeground(["unread"]);
  return query.data ?? 0;
}

async function seenAt() {
  try {
    const saved = Number(new Date((await AsyncStorage.getItem(SEEN_KEY)) ?? NaN));
    if (saved) return saved;
  } catch {}
  return Date.now() - FIRST_LOOK_DAYS * 864e5;
}

export function useNewNotifications() {
  const { session } = useSession();
  const query = useQuery({
    queryKey: ["notification-times", session?.user.id ?? null],
    enabled: !!session,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [times, seen] = await Promise.all([getNotificationTimes(supabase, session!.user.id), seenAt()]);
      return times.filter((at) => new Date(at).getTime() > seen).length;
    },
  });
  useRefetchOnForeground(["notification-times"]);
  return query.data ?? 0;
}

// Called by the Notifications screen when it's opened: clears the badge.
export function useMarkNotificationsSeen() {
  const queryClient = useQueryClient();
  useEffect(() => {
    AsyncStorage.setItem(SEEN_KEY, new Date().toISOString())
      .catch(() => {})
      .then(() => queryClient.invalidateQueries({ queryKey: ["notification-times"] }));
  }, [queryClient]);
}

function useRefetchOnForeground(key: string[]) {
  const queryClient = useQueryClient();
  const [k] = useState(key);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void queryClient.invalidateQueries({ queryKey: k });
    });
    return () => sub.remove();
  }, [queryClient, k]);
}
