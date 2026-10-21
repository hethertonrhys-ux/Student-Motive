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

// ---- Function's design system ------------------------------------------
//
// Every screen takes its look from here, so the app stays consistent:
// - Colours: LIGHT and DARK (./colors), as classes like bg-surface,
//   text-muted, bg-brand. Light or dark follows the phone's setting.
// - Text: the phone's own font (SF Pro on iPhone) in Apple's standard iOS
//   sizes, below. Use them through <T variant="headline"> etc. (ui.tsx);
//   don't add text-* size classes on top of a text style.
// - Spacing: the scale below, in Tailwind as p-1 (4), p-2 (8), p-3 (12),
//   p-4 (16), p-6 (24), p-8 (32), and the same for gap-, m-, px- ...
// - Corners: RADIUS below, in Tailwind as rounded-lg (8), rounded-xl (12),
//   rounded-2xl (16) and rounded-full.
// - Shadows: none, or shadow-soft (a faint 8% shadow) for things that float.
// - Icons: one set everywhere, Ionicons, through <Icon> (components/icon).
//   It looks like Apple's outline icons and is the same on iPhone, Android
//   and the web; Apple's own SF Symbols only exist on iPhones.
// - Floating bars and panels: <Frosted> (ui.tsx), the iOS frosted-glass blur.

// Apple's iOS text styles (size / line height in points, and weight).
export const TEXT_STYLES = {
  largeTitle: "text-[34px] leading-[41px] font-sans-bold tracking-tight", // a tab's big title
  title: "text-[28px] leading-[34px] font-sans-bold tracking-tight", // a page title
  title2: "text-[22px] leading-[28px] font-sans-bold", // a section title
  title3: "text-[20px] leading-[25px] font-sans-semibold", // a card's title
  headline: "text-[17px] leading-[22px] font-sans-semibold", // a list item's name, a button
  body: "text-[17px] leading-[22px] font-sans", // ordinary text
  callout: "text-[16px] leading-[21px] font-sans", // text in a card
  subhead: "text-[15px] leading-[20px] font-sans", // a line under a title
  footnote: "text-[13px] leading-[18px] font-sans", // small details: time, place
  caption: "text-[12px] leading-[16px] font-sans", // labels on pins and badges
  caption2: "text-[11px] leading-[13px] font-sans-semibold", // the tiniest labels, tab names
} as const;
export type TextStyle = keyof typeof TEXT_STYLES;

// Spacing, in points: Tailwind's 1, 2, 3, 4, 6 and 8 steps.
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

// Corner radius, in points.
export const RADIUS = { sm: 8, md: 12, lg: 16, full: 999 } as const;

// The one shadow, for things floating over content (as a style; the class is shadow-soft).
export const SHADOW = { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 2 }, elevation: 2 } as const;
