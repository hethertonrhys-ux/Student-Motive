import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { DARK, LIGHT, useTheme } from "@/lib/theme";
import { useMounted } from "@/lib/use-mounted";

// An icon that waits for the screen to be on. The web build is pre-rendered
// without the icon font, so drawing icons during that first paint would
// mismatch and make React redraw the page.
//
// Colours: pass a theme colour (the light value, e.g. "#5e5d78" for muted)
// and it becomes the dark-mode value when the phone is in dark mode.
const SWAP: Record<string, string> = { [LIGHT.ink]: DARK.ink, [LIGHT.muted]: DARK.muted, [LIGHT.brand]: DARK.brand, [LIGHT.line]: DARK.line, [LIGHT.surface]: DARK.surface, [LIGHT.bg]: DARK.bg };
export function Icon({ color, ...props }: ComponentProps<typeof Ionicons>) {
  const mounted = useMounted();
  const { dark } = useTheme();
  if (!mounted) return null;
  const themed = typeof color === "string" && dark ? (SWAP[color] ?? color) : color;
  return <Ionicons color={themed} {...props} />;
}
