import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The app's universal links: which studentfunction.com links open in the
// app (iPhone: the apple-app-site-association file the website serves;
// Android: app.json's intent filters), and that each has a screen in the
// app and a page on the website. Claim links and the Society Hub were added
// for the App Store build that includes the Hub.
const repo = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repo), "utf8");
const has = (path: string) => existsSync(new URL(path, repo));

type Aasa = { applinks: { details: { appIDs: string[]; paths: string[]; components: { "/": string }[] }[] } };
type AppJson = {
  expo: {
    ios: { associatedDomains: string[] };
    android: { intentFilters: { action: string; autoVerify?: boolean; data: { scheme: string; host: string; pathPrefix: string }[]; category: string[] }[] };
  };
};
type VercelJson = { rewrites: { source: string; destination: string; has?: unknown }[]; headers: { source: string; headers: { key: string; value: string }[] }[] };

const aasa = JSON.parse(read("apps/mobile/public/.well-known/apple-app-site-association")) as Aasa;
const app = JSON.parse(read("apps/mobile/app.json")) as AppJson;
const vercel = JSON.parse(read("apps/mobile/vercel.json")) as VercelJson;

const OLD_IOS = ["/e/*", "/s/*", "/social/*", "/u/*"];
const NEW_IOS = ["/claim/*", "/hub", "/hub/*"];
const OLD_ANDROID = ["/e/", "/s/", "/social/", "/u/"];
const NEW_ANDROID = ["/claim/", "/hub"];

describe("iPhone universal links (apple-app-site-association)", () => {
  const detail = aasa.applinks.details[0];

  it("is for the Function app", () => {
    expect(aasa.applinks.details).toHaveLength(1);
    expect(detail.appIDs).toEqual(["FVT2MCM7C9.com.studentfunction.app"]);
  });

  it("keeps the existing paths and adds claim links and the Hub, in paths and components", () => {
    const components = detail.components.map((c) => c["/"]);
    for (const path of [...OLD_IOS, ...NEW_IOS]) {
      expect(detail.paths).toContain(path);
      expect(components).toContain(path);
    }
    // The two lists say the same thing.
    expect([...components].sort()).toEqual([...detail.paths].sort());
  });

  it("is served as JSON", () => {
    const rule = vercel.headers.find((h) => h.source === "/.well-known/apple-app-site-association");
    expect(rule?.headers).toContainEqual({ key: "Content-Type", value: "application/json" });
  });

  it("is claimed by the iPhone app", () => {
    expect(app.expo.ios.associatedDomains).toContain("applinks:studentfunction.com");
  });
});

describe("Android app links (app.json intent filters)", () => {
  const filter = app.expo.android.intentFilters[0];

  it("keeps the existing prefixes and adds claim links and the Hub", () => {
    const prefixes = filter.data.map((d) => d.pathPrefix);
    for (const prefix of [...OLD_ANDROID, ...NEW_ANDROID]) expect(prefixes).toContain(prefix);
  });

  it("every entry is https on studentfunction.com, verified", () => {
    expect(filter.action).toBe("VIEW");
    expect(filter.autoVerify).toBe(true);
    expect(filter.category).toEqual(expect.arrayContaining(["BROWSABLE", "DEFAULT"]));
    for (const d of filter.data) expect({ scheme: d.scheme, host: d.host }).toEqual({ scheme: "https", host: "studentfunction.com" });
  });
});

describe("the new links have screens and web pages", () => {
  it("each opens a screen in the app, so a tap never lands on 'not found'", () => {
    for (const screen of ["claim/[token].tsx", "hub/index.tsx", "hub/[societyId]/index.tsx", "hub/[societyId]/requests.tsx"]) {
      expect(has(`apps/mobile/src/app/${screen}`), screen).toBe(true);
    }
  });

  it("each dynamic one has a website rewrite", () => {
    const rewrites = vercel.rewrites.filter((r) => !r.has).map((r) => `${r.source} -> ${r.destination}`);
    expect(rewrites).toContain("/claim/:token -> /claim/%5Btoken%5D");
    expect(rewrites).toContain("/hub/:societyId -> /hub/%5BsocietyId%5D");
    expect(rewrites).toContain("/hub/:societyId/requests -> /hub/%5BsocietyId%5D/requests");
  });

  it("the Society Hub pushes open the Hub (20261123000000_hub_push_links.sql)", () => {
    const sql = read("supabase/migrations/20261123000000_hub_push_links.sql");
    expect(sql).toContain("'/hub/' || sid, 'manager-added:'");
    expect(sql).toContain("'Open the Society Hub to see it.'");
    expect(sql).toContain("'/hub/' || new.society_id || '/requests', 'request-live:'");
    expect(sql).toContain("'/hub/' || r.id, k);");
    // The event admin checklist reminders still open the event's manage screen.
    expect(sql).toContain("'/dashboard/' || r.society_id || '/events/' || r.event_id, k);");
    expect(has("apps/mobile/src/app/dashboard/[societyId]/events/[eventId]/index.tsx")).toBe(true);
  });
});
