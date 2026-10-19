import { useSyncExternalStore } from "react";
import { Platform, useColorScheme } from "react-native";

// The design tokens from global.css, for the few places that need a plain
// colour value rather than a class (icons, the map, native pickers). Keep
// these the same as the CSS variables.
export const LIGHT = {
  bg: "#f7f7fb",
  surface: "#ffffff",
  ink: "#15142b",
  muted: "#5e5d78",
  line: "#e3e2ef",
  brand: "#DA291C",
  brandInk: "#ffffff",
  brandSoft: "#fdeceb",
  live: "#f43f5e",
  danger: "#be123c",
  ok: "#047857",
};
export const DARK: typeof LIGHT = {
  bg: "#0d0c1d",
  surface: "#17162c",
  ink: "#f2f1fb",
  muted: "#a3a2c2",
  line: "#2b2a48",
  brand: "#f0564a",
  brandInk: "#ffffff",
  brandSoft: "#3a1512",
  live: "#fb7185",
  danger: "#fb7185",
  ok: "#34d399",
};

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
export const PLACEHOLDER = { light: "rgba(94, 93, 120, 0.7)", dark: "rgba(163, 162, 194, 0.7)" };
export function usePlaceholderColor() {
  return useTheme().dark ? PLACEHOLDER.dark : PLACEHOLDER.light;
}

export function useTheme() {
  const nativeDark = useColorScheme() === "dark";
  const webDark = useWebDark();
  const dark = Platform.OS === "web" ? webDark : nativeDark;
  return { dark, colors: dark ? DARK : LIGHT };
}
