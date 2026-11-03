import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The app-wide switches in apps/mobile/src/lib/app-features.ts. The map is
// switched off for the Abacus launch: the Map tab says "Map coming soon", and
// these checks make sure every other link to it goes through the switch, and
// that its own code is still there to switch back on. They pass with the map on or off, so switching it back on is the
// one-line change in app-features.ts and nothing else.
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const src = join(repo, "apps/mobile/src");
const read = (path: string) => readFileSync(join(repo, path), "utf8");

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
// The map's own code, which is left as it is while it's switched off.
const mapCode = (path: string) => path.includes("/components/map/") || path.endsWith("/app/(tabs)/map.tsx");
const appFiles = files(src).filter((path) => !mapCode(path) && !path.endsWith("/lib/app-features.ts"));

describe("app-wide switches", () => {
  const config = read("apps/mobile/src/lib/app-features.ts");

  it("has a single on/off setting for the map", () => {
    expect(config).toMatch(/export const MAP_ENABLED: boolean = (true|false);/);
  });

  it("sends people to the map when it's on and to Societies when it's off", () => {
    expect(config).toMatch(/HOME_ROUTE = MAP_ENABLED \? MAP_ROUTE : "\/\(tabs\)\/societies"/);
    expect(config).toMatch(/HOME_PATH = MAP_ENABLED \? "\/map" : "\/societies"/);
  });

  it("keeps the map's own code", () => {
    expect(statSync(join(src, "app/(tabs)/map.tsx")).isFile()).toBe(true);
    expect(readdirSync(join(src, "components/map")).length).toBeGreaterThan(0);
  });

  it("has no link straight to the map outside the switch file", () => {
    const direct = appFiles.filter((path) => /["'`]\/\(tabs\)\/map["'`]|href=["']\/map["']/.test(readFileSync(path, "utf8")));
    expect(direct.map((path) => path.slice(src.length + 1))).toEqual([]);
  });

  it("only links to the map behind the switch", () => {
    const unguarded = appFiles.filter((path) => {
      const code = readFileSync(path, "utf8");
      return code.includes("MAP_ROUTE") && !code.includes("MAP_ENABLED");
    });
    expect(unguarded.map((path) => path.slice(src.length + 1))).toEqual([]);
  });

  it("keeps the Map tab, which says 'Map coming soon' while the map is off", () => {
    const tabs = read("apps/mobile/src/app/(tabs)/_layout.tsx");
    expect(tabs).toContain('{ name: "map", title: "Map", icon: "location" }');
    expect(tabs).toContain('initialRouteName: MAP_ENABLED ? "map" : "societies"');
    expect(tabs).toContain('backBehavior={MAP_ENABLED ? "firstRoute" : "initialRoute"}');
    expect(read("apps/mobile/src/app/(tabs)/map.tsx")).toContain("return MAP_ENABLED ? <MapScreen /> : <MapComingSoon />;");
    const soon = read("apps/mobile/src/components/map-coming-soon.tsx");
    expect(soon).toContain("Map coming soon");
    expect(soon).not.toMatch(/components\/map\/|lib\/location/);
  });

  it("only asks for location on the map", () => {
    const askers = appFiles.filter((path) => /lib\/location|expo-location/.test(readFileSync(path, "utf8")) && !path.endsWith("/lib/location.ts"));
    expect(askers).toEqual([]);
  });

  it("opens the home-screen website at the front door, not the map", () => {
    expect(JSON.parse(read("apps/mobile/public/manifest.webmanifest")).start_url).toBe("/");
  });
});
