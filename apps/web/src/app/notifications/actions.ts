"use server";

import { getUserId } from "@/lib/auth";
import { getFriendRequests, getSocietyPosts, getTableMoves, getTwoTruthsDays } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

// For the bell's badge: when each notification happened. The phone compares
// them with when you last opened Notifications.
export async function getNotificationTimes(): Promise<{ times: string[] }> {
  const me = await getUserId();
  if (!me) return { times: [] };
  const supabase = await createClient();
  const [posts, requests, moves, plays] = await Promise.all([
    getSocietyPosts(supabase, me),
    getFriendRequests(supabase, me),
    getTableMoves(supabase, me),
    getTwoTruthsDays(supabase),
  ]);
  return { times: [...posts, ...requests, ...moves, ...plays].map((n) => n.at) };
}
