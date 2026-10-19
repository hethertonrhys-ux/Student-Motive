import { useQuery, useQueryClient } from "@tanstack/react-query";
import { accountDetailsMissing, PROFILE_COLUMNS, type Profile } from "@function/shared";
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
      const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", id!).single();
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

// After logging in: does this account still need the account-details step
// (full name and graduation year)? True for brand-new accounts and for
// older ones made before those details were asked for.
export async function needsAccountDetails(userId: string) {
  const { data } = await supabase.from("profiles").select("full_name, graduation_year").eq("id", userId).maybeSingle();
  return accountDetailsMissing((data as { full_name: string | null; graduation_year: number | null } | null) ?? { full_name: null, graduation_year: null });
}

// The old name, kept so every caller keeps working.
export const needsWelcome = (userId: string, _createdAt?: string, _seen?: boolean) => needsAccountDetails(userId);
