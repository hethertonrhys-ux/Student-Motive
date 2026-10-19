import { usePushLifecycle } from "@/lib/push";
import { useSession } from "@/providers/session";

// Keeps this device's push token fresh and opens the right screen when a
// notification is tapped. Rendered once, at the root.
export function PushLifecycle() {
  const { session } = useSession();
  usePushLifecycle(session?.user.id ?? null);
  return null;
}
