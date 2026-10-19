import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useMounted } from "@/lib/use-mounted";

// An icon that waits for the screen to be on. The web build is pre-rendered
// without the icon font, so drawing icons during that first paint would
// mismatch and make React redraw the page.
export function Icon(props: ComponentProps<typeof Ionicons>) {
  const mounted = useMounted();
  return mounted ? <Ionicons {...props} /> : null;
}
