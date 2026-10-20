import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// The app's colours are written down twice: as CSS variables in global.css
// (for classes like bg-brand) and as plain values in colors.ts (for the
// places a class can't reach). These checks fail if the two drift apart,
// so light and dark mode look the same everywhere.
const repo = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repo), "utf8");
const css = read("apps/mobile/src/global.css");
const html = read("apps/mobile/src/app/+html.tsx");
const colorsTs = read("apps/mobile/src/lib/colors.ts");
const tailwind = createRequire(import.meta.url)("../../../apps/mobile/tailwind.config.js") as { theme: { extend: { colors: Record<string, string> } } };

// The key: "value" pairs of one of colors.ts's objects (read as text, since
// the tests can't load the app's code).
function object(name: string) {
  const start = colorsTs.indexOf(`export const ${name}`);
  const block = colorsTs.slice(colorsTs.indexOf("{", start) + 1, colorsTs.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/(\w+):\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
}
const LIGHT = object("LIGHT");
const DARK = object("DARK");
const PLACEHOLDER = object("PLACEHOLDER");

// brandInk in colors.ts is --brand-ink in the CSS.
const cssName = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

// The --name: value pairs in the first block after `start`.
function variables(start: number) {
  const block = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().toLowerCase()]));
}
const lightAll = variables(css.indexOf(":root"));
const darkAll = variables(css.indexOf(":root", css.indexOf("prefers-color-scheme: dark")));
// The colours themselves, without their -rgb versions.
const only = (vars: Record<string, string>, rgb: boolean) => Object.fromEntries(Object.entries(vars).filter(([k]) => k.endsWith("-rgb") === rgb));
const lightVars = only(lightAll, false);
const darkVars = only(darkAll, false);

const lower = (colours: Record<string, string>) => Object.fromEntries(Object.entries(colours).map(([k, v]) => [cssName(k), v.toLowerCase()]));

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgb = (hex: string) => channels(hex).join(", ");

describe("design tokens", () => {
  it("reads colors.ts", () => {
    expect(Object.keys(LIGHT)).toContain("brand");
    expect(Object.keys(DARK)).toEqual(Object.keys(LIGHT));
  });

  it("global.css and colors.ts have the same light colours", () => {
    expect(lightVars).toEqual(lower(LIGHT));
  });

  it("global.css and colors.ts have the same dark colours", () => {
    expect(darkVars).toEqual(lower(DARK));
  });

  it("each colour's -rgb version is the same colour, in light and dark", () => {
    // The classes use --x-rgb so faded versions (bg-danger/10) work.
    for (const [all, colours] of [[lightAll, LIGHT], [darkAll, DARK]] as const) {
      const expected = Object.fromEntries(Object.entries(colours).map(([k, v]) => [`${cssName(k)}-rgb`, channels(v).join(" ")]));
      expect(only(all, true)).toEqual(expected);
    }
  });

  it("every colour has a Tailwind class that can be faded", () => {
    for (const key of Object.keys(LIGHT)) {
      expect(tailwind.theme.extend.colors[cssName(key)]).toBe(`rgb(var(--${cssName(key)}-rgb) / <alpha-value>)`);
    }
  });

  it("placeholder text is the muted colour at 70%", () => {
    expect(PLACEHOLDER.light).toBe(`rgba(${rgb(LIGHT.muted)}, 0.7)`);
    expect(PLACEHOLDER.dark).toBe(`rgba(${rgb(DARK.muted)}, 0.7)`);
  });

  it("the web page's first paint uses the page background", () => {
    // Before the app starts, +html.tsx paints the background so dark mode doesn't flash white.
    expect(html.toLowerCase()).toContain(`body{background:${LIGHT.bg.toLowerCase()}}`);
    expect(html.toLowerCase()).toContain(`body{background:${DARK.bg.toLowerCase()}}`);
    expect(html.toLowerCase()).toContain(`media="(prefers-color-scheme: dark)" content="${DARK.bg.toLowerCase()}"`);
  });
});
