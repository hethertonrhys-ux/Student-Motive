import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// The send-update script's decisions (apps/mobile/scripts/update-env.mjs).
import { bundleEnv, npxCommand, parseArgs, productionEnv, quoteForCmd, quoteForSh, OPTIONAL_ENV, REQUIRED_ENV } from "../../../apps/mobile/scripts/update-env.mjs";

// Over-the-air updates for the phone app (EAS Update): app.json and eas.json
// point builds at the right update channel, an update only reaches builds of
// the same app version, the send-update script always bundles eas.json's
// production settings (so an update can never ship without the database
// address), and the "new version" banner stays off the website.
const repo = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repo), "utf8");
const has = (path: string) => existsSync(new URL(path, repo));

type AppJson = { expo: { version: string; runtimeVersion: unknown; updates: { url: string }; extra: { eas: { projectId: string } } } };
type EasJson = { build: Record<string, { channel?: string; env?: Record<string, string> }> };
type PackageJson = { dependencies: Record<string, string>; scripts: Record<string, string> };

const app = JSON.parse(read("apps/mobile/app.json")) as AppJson;
const easText = read("apps/mobile/eas.json");
const eas = JSON.parse(easText) as EasJson;
const pkg = JSON.parse(read("apps/mobile/package.json")) as PackageJson;

describe("app.json", () => {
  it("asks Expo's update server for this project's updates", () => {
    expect(app.expo.extra.eas.projectId).toBe("0b973917-964c-41f7-89f4-c2a2abb81265");
    expect(app.expo.updates.url).toBe(`https://u.expo.dev/${app.expo.extra.eas.projectId}`);
  });

  it("only gives an update to builds of the same app version", () => {
    expect(app.expo.runtimeVersion).toEqual({ policy: "appVersion" });
    expect(app.expo.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("has the updater installed, matching the Expo SDK", () => {
    expect(pkg.dependencies["expo-updates"]).toMatch(/^~58\./);
    expect(pkg.dependencies.expo).toMatch(/^~58\./);
  });
});

describe("eas.json", () => {
  it("each build profile listens on its own channel", () => {
    expect(Object.keys(eas.build).sort()).toEqual(["development", "preview", "production"]);
    for (const [name, profile] of Object.entries(eas.build)) expect(profile.channel, name).toBe(name);
  });

  it("the production settings have everything the send-update script needs", () => {
    const env = eas.build.production.env ?? {};
    for (const key of REQUIRED_ENV) expect(env[key]?.trim(), key).toBeTruthy();
    expect(productionEnv(easText).problems).toEqual([]);
    expect(env.EXPO_PUBLIC_SUPABASE_URL).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co$/);
    expect(env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toMatch(/^sb_publishable_/);
  });

  it("every setting the phone app reads is one the script requires (VAPID is for web push only)", () => {
    const dir = new URL("apps/mobile/src/", repo);
    const used = new Set<string>();
    for (const file of readdirSync(dir, { recursive: true }) as string[]) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      for (const m of readFileSync(new URL(file, dir), "utf8").matchAll(/process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)/g)) used.add(m[1]);
    }
    used.delete("EXPO_PUBLIC_VAPID_PUBLIC_KEY");
    expect(used.size).toBeGreaterThanOrEqual(5);
    for (const key of used) expect([...REQUIRED_ENV, ...OPTIONAL_ENV], key).toContain(key);
  });

  it("only ever puts Stripe's publishable key in the app, never the secret key", () => {
    const withStripe = (key: string) => easText.replace(/"EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY": "[^"]*"/g, `"EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY": "${key}"`);
    expect(productionEnv(withStripe("")).problems).toEqual([]);
    expect(productionEnv(withStripe("pk_test_abc")).problems).toEqual([]);
    expect(productionEnv(withStripe("sk_test_abc")).problems.join(" ")).toMatch(/never the secret key/);
    expect(productionEnv(withStripe("rk_live_abc")).problems.join(" ")).toMatch(/never the secret key/);
  });
});

describe("the send-update script", () => {
  it("is `npm run send-update` in apps/mobile", () => {
    expect(pkg.scripts["send-update"]).toBe("node scripts/send-update.mjs");
    const script = read("apps/mobile/scripts/send-update.mjs");
    expect(script).toContain('"eas-cli", "update", "--channel", "production", "--message", message');
    expect(script).toContain('"expo", "export", "--platform", "ios", "--output-dir", outDir');
  });

  it("refuses settings that are missing, blank, local or secret", () => {
    const base = JSON.parse(easText) as EasJson;
    const variant = (change: (env: Record<string, string>) => void) => {
      const copy = structuredClone(base);
      change(copy.build.production.env!);
      return productionEnv(JSON.stringify(copy)).problems;
    };
    expect(variant((env) => delete env.EXPO_PUBLIC_SUPABASE_URL)).toEqual(["EXPO_PUBLIC_SUPABASE_URL is missing from eas.json (build → production → env)."]);
    expect(variant((env) => (env.EXPO_PUBLIC_CONTACT_EMAIL = "  "))).toHaveLength(1);
    expect(variant((env) => (env.EXPO_PUBLIC_SUPABASE_URL = "http://localhost:54400"))).toHaveLength(1);
    expect(variant((env) => (env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_secret_abc"))).toHaveLength(1);
    expect(productionEnv('{"build":{}}').problems).toHaveLength(REQUIRED_ENV.length);
    expect(productionEnv("not json").problems).toEqual(["eas.json isn't valid JSON."]);
  });

  it("needs a message, and never sends when --dry-run was given in any form", () => {
    expect(parseArgs(["Fixed the Hub button"])).toEqual({ dryRun: false, message: "Fixed the Hub button", unknown: [] });
    expect(parseArgs(["Fixed", "the", "button"]).message).toBe("Fixed the button");
    expect(parseArgs([]).message).toBe("");
    expect(parseArgs(["--dry-run"]).dryRun).toBe(true);
    // `npm run send-update --dry-run` (no `--`): npm keeps the flag and says so in npm_config_dry_run.
    expect(parseArgs(["Fixed it"], { npm_config_dry_run: "true" }).dryRun).toBe(true);
    expect(parseArgs(["--dryrun", "x"]).unknown).toEqual(["--dryrun"]);
  });

  it("bundles with eas.json's settings only, never a local .env", () => {
    const { env } = productionEnv(easText);
    const out = bundleEnv({ PATH: "/bin", EXPO_PUBLIC_SUPABASE_URL: "http://localhost:54400", EXPO_PUBLIC_VAPID_PUBLIC_KEY: "local", npm_config_dry_run: "true" }, env);
    expect(out.PATH).toBe("/bin");
    expect(out.EXPO_PUBLIC_SUPABASE_URL).toBe(env.EXPO_PUBLIC_SUPABASE_URL);
    expect(out.EXPO_PUBLIC_VAPID_PUBLIC_KEY).toBeUndefined();
    expect(out.npm_config_dry_run).toBeUndefined();
    expect(out.EXPO_NO_DOTENV).toBe("1");
    expect(out.EAS_UPDATE_SKIP_ENVIRONMENT_CHECK).toBe("1");
    for (const key of REQUIRED_ENV) expect(out[key]).toBe(env[key]);
  });

  it("runs npx through Node itself when it can (no shell, so the message arrives as typed)", () => {
    const npmCli = join("/opt", "node", "lib", "node_modules", "npm", "bin", "npm-cli.js");
    const npxCli = join("/opt", "node", "lib", "node_modules", "npm", "bin", "npx-cli.js");
    const viaNpm = npxCommand(["eas-cli", "update", "--message", 'a "b" & c'], { execPath: "/opt/node/bin/node", npmExecPath: npmCli, platform: "linux", exists: (p: string) => p === npxCli });
    expect(viaNpm).toEqual({ command: "/opt/node/bin/node", args: [npxCli, "eas-cli", "update", "--message", 'a "b" & c'], shell: false });
    const fallback = npxCommand(["eas-cli", "it's"], { execPath: "/x/node", npmExecPath: undefined, platform: "linux", exists: () => false });
    expect(fallback).toEqual({ command: "npx 'eas-cli' 'it'\\''s'", args: [], shell: true });
    expect(npxCommand(["a b"], { execPath: "C:\\node\\node.exe", npmExecPath: undefined, platform: "win32", exists: () => false }).command).toBe("npx.cmd ^^^\"a^^^ b^^^\"");
  });

  it("quotes for each shell", () => {
    expect(quoteForSh("it's $HOME")).toBe("'it'\\''s $HOME'");
    expect(quoteForCmd('say "hi" 100%')).toBe('^^^"say^^^ \\^^^"hi\\^^^"^^^ 100^^^%^^^"');
  });
});

describe("the 'new version' banner", () => {
  it("is mounted once at the root", () => {
    const layout = read("apps/mobile/src/app/_layout.tsx");
    expect(layout.match(/<UpdateBanner \/>/g)).toHaveLength(1);
  });

  it("on the website shows nothing and never loads the phone updater", () => {
    const web = read("apps/mobile/src/components/update-banner.web.tsx");
    expect(web).not.toContain("import");
    expect(web).toContain("return null");
    // No plain update-banner.tsx that Metro could pick for the website instead.
    expect(has("apps/mobile/src/components/update-banner.tsx")).toBe(false);
  });

  it("on phones only runs in real builds with the updater, and only restarts on a tap", () => {
    const native = read("apps/mobile/src/components/update-banner.native.tsx");
    expect(native).toContain('Updates.isEnabled && !__DEV__ && Platform.OS !== "web"');
    expect(native).toContain("A new version of Function is ready.");
    expect(native.match(/reloadAsync\(/g)).toHaveLength(1);
    expect(native).toMatch(/const restart = async \(\) => \{[^}]*reloadAsync/);
    for (const id of ["update-banner", "update-restart", "update-dismiss"]) expect(native).toContain(`testID="${id}"`);
  });
});

describe("the owner's launch guide", () => {
  const guide = read("docs/EXPO_LAUNCH.md");

  it("no longer says to refuse expo-updates, and explains sending an update", () => {
    expect(guide).not.toMatch(/install `?expo-updates`?, say \*\*no\*\*/);
    expect(guide).toMatch(/^## (3b\. )?Sending an update to phones \(no new build\)$/m);
    expect(guide).toContain('npm run send-update -- "');
  });

  it("says to run new migrations before sending, and rolls back to the last good update, not the broken one", () => {
    const part = guide.slice(guide.indexOf("## 3b."), guide.indexOf("## 4."));
    expect(part.indexOf("supabase/migrations")).toBeGreaterThan(-1);
    expect(part.indexOf("supabase/migrations")).toBeLessThan(part.indexOf("npm run send-update -- \""));
    expect(part).toContain("**Published Update**");
    expect(part).toContain("the last update that worked");
    expect(part).not.toContain("pick the latest production update");
  });

  it("there is no committed production .env that could point local builds at the live database", () => {
    expect(has("apps/mobile/.env.production")).toBe(false);
    expect(read(".gitignore")).toMatch(/^\.env\.\*$/m);
  });
});
