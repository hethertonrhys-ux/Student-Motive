// The same design tokens as the website (apps/web/src/app/globals.css), with
// the brand in Function red. Colours are CSS variables (see src/global.css)
// so light and dark mode work the same way as on the site. The classes use
// each colour's -rgb version so a fade like bg-danger/10 (10% red) works.
//
// Text uses the phone's own font (SF Pro on iPhone, Roboto on Android, the
// system font on the web), so no font family is ever set: the font-* classes
// only choose a weight. The old names (font-sans-semibold, font-display...)
// keep working on every screen; src/lib/theme.ts has the text styles.
const plugin = require("tailwindcss/plugin");

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
    },
  },
  // No font families: the system font is the default everywhere.
  corePlugins: { fontFamily: false },
  plugins: [
    plugin(({ addUtilities }) =>
      addUtilities({
        ".font-sans": { fontWeight: "400" },
        ".font-sans-semibold": { fontWeight: "600" },
        ".font-sans-bold": { fontWeight: "700" },
        ".font-display": { fontWeight: "700" },
        ".font-display-bold": { fontWeight: "700" },
      }),
    ),
  ],
};
