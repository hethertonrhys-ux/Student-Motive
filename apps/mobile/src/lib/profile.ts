import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Profile } from "@function/shared";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// The logged-in person's profile row, cached and shared by every screen.
export function useProfile() {
  const { session } = useSession();
  const id = session?.user.id ?? null;
  const query = useQuery({
    queryKey: ["profile", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, email, display_name, is_admin, university").eq("id", id!).single();
      if (error) throw error;
      return data as Profile;
    },
  });
  return { profile: id ? (query.data ?? null) : null, loading: !!id && query.isPending, refetch: query.refetch };
}

export function useInvalidateProfile() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["profile"] });
}

// After logging in: does this account still need the welcome step?
// (Brand new, hasn't seen it on this device, and has no prompts yet.)
const NEW_ACCOUNT_MS = 15 * 60 * 1000;
export async function needsWelcome(userId: string, createdAt: string | undefined, seenWelcome: boolean) {
  if (seenWelcome || !createdAt || Date.now() - new Date(createdAt).getTime() > NEW_ACCOUNT_MS) return false;
  const { count } = await supabase.from("profile_prompts").select("prompt_id", { count: "exact", head: true }).eq("user_id", userId);
  return !count;
}
