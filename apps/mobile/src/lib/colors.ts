// Function's colours as plain values, for the places that need a colour
// rather than a class (icons, the map, native pickers, the share-card
// canvas). src/global.css holds the same colours as CSS variables for the
// classes (bg-brand, text-muted...). The two must match: a test in
// packages/shared (design-tokens.test.ts) fails if they don't, so change
// both together.
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

// Placeholder text in inputs: the muted colour at 70%.
export const PLACEHOLDER = { light: "rgba(94, 93, 120, 0.7)", dark: "rgba(163, 162, 194, 0.7)" };
