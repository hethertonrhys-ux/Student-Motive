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
// (Not white or the page grey: white is also dark mode's ink, so swapping it would hide white icons.)
const SWAP: Record<string, string> = { [LIGHT.ink]: DARK.ink, [LIGHT.muted]: DARK.muted, [LIGHT.brand]: DARK.brand, [LIGHT.line]: DARK.line };
// The old palette's ink and grey, still written into a few screens, are the theme's ink and grey.
const OLD: Record<string, string> = { "#15142b": LIGHT.ink, "#5e5d78": LIGHT.muted };
export function Icon({ color, ...props }: ComponentProps<typeof Ionicons>) {
  const mounted = useMounted();
  const { dark } = useTheme();
  if (!mounted) return null;
  const light = typeof color === "string" ? (OLD[color.toLowerCase()] ?? color) : color;
  const themed = typeof light === "string" && dark ? (SWAP[light] ?? light) : light;
  return <Ionicons color={themed} {...props} />;
}
