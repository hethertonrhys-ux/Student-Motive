"use client";

import { useOptimistic, useTransition } from "react";
import { showToast } from "@/components/toast";

type Result = { error?: string } | void | undefined;

// Shows the result of a tap straight away while the database catches up in
// the background. If the database says no, the screen goes back to how it
// was and a short message explains why.
export function useInstant<T>(saved: T) {
  const [shown, setShown] = useOptimistic(saved);
  const [, start] = useTransition();

  function run(next: T, action: () => Promise<Result>, failMessage = "That didn't go through. Please try again.") {
    start(async () => {
      setShown(next);
      try {
        const result = await action();
        if (result && result.error) showToast(result.error);
      } catch {
        showToast(failMessage);
      }
    });
  }

  return [shown, run] as const;
}
