// The same design tokens as the website (apps/web/src/app/globals.css), with
// the brand in Function red. Colours are CSS variables (see src/global.css)
// so light and dark mode work the same way as on the site. The classes use
// each colour's -rgb version so a fade like bg-danger/10 (10% red) works.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "../../packages/shared/src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg-rgb) / <alpha-value>)",
        surface: "rgb(var(--surface-rgb) / <alpha-value>)",
        ink: "rgb(var(--ink-rgb) / <alpha-value>)",
        muted: "rgb(var(--muted-rgb) / <alpha-value>)",
        line: "rgb(var(--line-rgb) / <alpha-value>)",
        brand: "rgb(var(--brand-rgb) / <alpha-value>)",
        "brand-ink": "rgb(var(--brand-ink-rgb) / <alpha-value>)",
        "brand-soft": "rgb(var(--brand-soft-rgb) / <alpha-value>)",
        live: "rgb(var(--live-rgb) / <alpha-value>)",
        danger: "rgb(var(--danger-rgb) / <alpha-value>)",
        ok: "rgb(var(--ok-rgb) / <alpha-value>)",
      },
      // A soft, wide shadow for cards and buttons (NativeWind's own are a
      // hard 35% black). Android uses the matching elevation.
      boxShadow: {
        soft: "0px 2px 12px rgba(21, 20, 43, 0.08)",
      },
      elevation: {
        soft: "2",
      },
      fontFamily: {
        sans: ["Figtree_400Regular"],
        "sans-semibold": ["Figtree_600SemiBold"],
        "sans-bold": ["Figtree_700Bold"],
        display: ["BricolageGrotesque_800ExtraBold"],
        "display-bold": ["BricolageGrotesque_700Bold"],
      },
    },
  },
  plugins: [],
};
