// The same design tokens as the website (apps/web/src/app/globals.css), with
// the brand in Function red. Colours are CSS variables (see src/global.css)
// so light and dark mode work the same way as on the site.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "../../packages/shared/src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        line: "var(--line)",
        brand: "var(--brand)",
        "brand-ink": "var(--brand-ink)",
        "brand-soft": "var(--brand-soft)",
        live: "var(--live)",
        danger: "var(--danger)",
        ok: "var(--ok)",
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
