import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCommunityHome, getCommunityPublic, loadChatsTab } from "@function/shared";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// The data the community screens share, under the same keys everywhere so
// a change on one screen shows on the others.

// The community's page for you (logged in), or null if there's no such community.
export function useCommunityHome(slug: string) {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  return useQuery({ queryKey: ["community", slug, userId], queryFn: () => getCommunityHome(supabase, slug), enabled: !!userId && !!slug });
}

// The public card (anyone, even logged out).
export function useCommunityPublic(slug: string, enabled = true) {
  return useQuery({ queryKey: ["community-public", slug], queryFn: () => getCommunityPublic(supabase, slug), enabled: enabled && !!slug });
}

// Your chats (the Chats tab's list): for the main chat's unread count, last message and mute.
export function useChatList() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  return useQuery({ queryKey: ["threads", userId], queryFn: () => loadChatsTab(supabase, userId!), enabled: !!userId });
}

// After any change in a community: everything that shows it.
export function useRefreshCommunity() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      ["community", "community-public", "community-roster", "community-requests", "community-claims", "community-group-members", "my-communities", "threads", "unread", "admin"].map((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }),
      ),
    );
}
