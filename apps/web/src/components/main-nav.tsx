import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BottomTabBar } from "./bottom-tab-bar";

// Loads what the bottom bar needs: your photo and the red dots.
export async function MainNav() {
  const profile = await getProfile();
  if (!profile) return <BottomTabBar meId={null} avatarUrl={null} name={null} socialRequests={0} unread={0} />;

  const supabase = await createClient();
  const [{ data: me }, { count: socialRequests }, { data: unread }] = await Promise.all([
    supabase.from("profiles").select("avatar_url").eq("id", profile.id).maybeSingle(),
    // Join requests waiting on Social events you're hosting that haven't finished.
    supabase
      .from("social_event_members")
      .select("event_id, social_events!inner(host_id, ends_at, is_cancelled)", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("social_events.host_id", profile.id)
      .eq("social_events.is_cancelled", false)
      .gt("social_events.ends_at", new Date().toISOString()),
    supabase.rpc("unread_message_count"),
  ]);

  return (
    <BottomTabBar
      meId={profile.id}
      avatarUrl={me?.avatar_url ?? null}
      name={profile.display_name}
      socialRequests={socialRequests ?? 0}
      unread={Number(unread ?? 0)}
    />
  );
}
