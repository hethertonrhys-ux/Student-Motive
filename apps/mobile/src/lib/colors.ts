// Function's colours as plain values, for the places that need a colour
// rather than a class (icons, the map, native pickers, the share-card
// canvas). src/global.css holds the same colours as CSS variables for the
// classes (bg-brand, text-muted...). The two must match: a test in
// packages/shared (design-tokens.test.ts) fails if they don't, so change
// both together.
//
// A small, iOS-like palette: neutral greys (Apple's own system greys), one
// accent (Function red), and green and red for success and errors. Dark
// mode is true black with dark grey cards, like Instagram and WhatsApp.
export const LIGHT = {
  bg: "#F2F2F7", // page background (iOS grouped background)
  surface: "#FFFFFF", // cards, sheets, inputs, tab bar
  ink: "#0A0A0A", // main text
  muted: "#6C6C70", // secondary text
  line: "#E5E5EA", // borders and dividers
  brand: "#DA291C", // Function red: the one accent
  brandInk: "#FFFFFF", // text on red
  brandSoft: "#FDECEB", // pale red: selected and highlighted things
  live: "#DA291C", // happening now (the accent)
  danger: "#D70015", // errors and delete
  ok: "#248A3D", // success
};
export const DARK: typeof LIGHT = {
  bg: "#000000",
  surface: "#1C1C1E",
  ink: "#FFFFFF",
  muted: "#98989F",
  line: "#38383A",
  brand: "#F0564A",
  brandInk: "#FFFFFF",
  brandSoft: "#3A1512",
  live: "#F0564A",
  danger: "#FF6961",
  ok: "#30D158",
};

// Placeholder text in inputs: the muted colour at 70%.
export const PLACEHOLDER = { light: "rgba(108, 108, 112, 0.7)", dark: "rgba(152, 152, 159, 0.7)" };
