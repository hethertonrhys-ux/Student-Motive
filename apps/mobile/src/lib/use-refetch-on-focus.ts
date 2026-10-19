import type { UseQueryResult } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

// When a screen comes back into view, refresh its data if it's gone stale.
export function useRefetchOnFocus(query: Pick<UseQueryResult, "isStale" | "refetch">) {
  useFocusEffect(
    useCallback(() => {
      if (query.isStale) void query.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );
}

// Pull-to-refresh state that doesn't re-render the screen on every
// background poll (reading query.isRefetching would).
export function usePullToRefresh(refetch: () => Promise<unknown>) {
  const [pulling, setPulling] = useState(false);
  const onRefresh = useCallback(async () => {
    setPulling(true);
    try {
      await refetch();
    } finally {
      setPulling(false);
    }
  }, [refetch]);
  return { refreshing: pulling, onRefresh };
}
