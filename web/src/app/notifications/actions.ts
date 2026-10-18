"use server";

import { getUserId } from "@/lib/auth";
import { getFriendRequests, getSocietyPosts } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

// For the bell's badge: when each notification happened. The phone compares
// them with when you last opened Notifications.
export async function getNotificationTimes(): Promise<{ times: string[] }> {
  const me = await getUserId();
  if (!me) return { times: [] };
  const supabase = await createClient();
  const [posts, requests] = await Promise.all([getSocietyPosts(supabase, me), getFriendRequests(supabase, me)]);
  return { times: [...posts, ...requests].map((n) => n.at) };
}
