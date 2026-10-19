import { useQuery } from "@tanstack/react-query";
import { EMPTY_FILTER_CONTEXT, loadFilterContext, type FilterContext } from "@function/shared";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// Who you're connected to (friends, your societies), loaded once and shared
// by the map, event search and Recommended. Logged out: empty.
export function useFilterContext(): { context: FilterContext; ready: boolean } {
  const { session } = useSession();
  const myId = session?.user.id ?? null;
  const query = useQuery({ queryKey: ["filter-context", myId], queryFn: () => loadFilterContext(supabase, myId), enabled: !!myId, staleTime: 5 * 60_000 });
  if (!myId) return { context: EMPTY_FILTER_CONTEXT, ready: true };
  return { context: query.data ?? EMPTY_FILTER_CONTEXT, ready: !!query.data };
}
