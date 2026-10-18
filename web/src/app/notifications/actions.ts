"use server";

import { getUserId } from "@/lib/auth";
import { getSocietyPosts } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

// For the bell's badge: when each notification happened. The phone compares
// them with when you last opened Notifications.
export async function getNotificationTimes(): Promise<{ posts: string[] }> {
  const me = await getUserId();
  if (!me) return { posts: [] };
  const supabase = await createClient();
  const posts = await getSocietyPosts(supabase, me);
  return { posts: posts.map((p) => p.at) };
}
