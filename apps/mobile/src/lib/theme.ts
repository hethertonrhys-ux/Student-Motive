import { useSyncExternalStore } from "react";
import { Platform, useColorScheme } from "react-native";
import { DARK, LIGHT, PLACEHOLDER } from "./colors";

// The colours live in ./colors (kept in step with global.css).
export { DARK, LIGHT, PLACEHOLDER };

// On the web, React Native's useColorScheme can report "light" after the
// pre-rendered page loads even when the phone is in dark mode, so the web
// asks the browser directly (and follows it if it changes). The first
// paint is always light, matching the pre-rendered page; it switches the
// moment the app is on.
const query = Platform.OS === "web" && typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
function subscribe(onChange: () => void) {
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}
function useWebDark() {
  return useSyncExternalStore(subscribe, () => !!query?.matches, () => false);
}

// Placeholder text in inputs: the muted colour at 70%.
export function usePlaceholderColor() {
  return useTheme().dark ? PLACEHOLDER.dark : PLACEHOLDER.light;
}

export function useTheme() {
  const nativeDark = useColorScheme() === "dark";
  const webDark = useWebDark();
  const dark = Platform.OS === "web" ? webDark : nativeDark;
  return { dark, colors: dark ? DARK : LIGHT };
}
