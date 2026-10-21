// The pieces of send-update.mjs that make decisions, kept apart so the unit
// tests (packages/shared/test/over-the-air-updates.test.ts) can check them.
//
// An over-the-air update is the app's JavaScript, bundled on the computer
// that sends it. The public settings the app is built with (the EXPO_PUBLIC_*
// values: which database, which website) are baked into that bundle, and
// they live in one place: eas.json, build profile "production". Using the
// same values for builds and updates means an update always talks to the
// same database as the build it lands on.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

// The settings the phone app needs. Without the first two the app stops
// at launch (src/lib/supabase.ts), so an update must never go out without them.
// Settings the app can run without: Stripe's publishable key (payments for
// paid plans stay off until it's set). When set, it must be pk_….
export const OPTIONAL_ENV = ["EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY"];

export const REQUIRED_ENV = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_SITE_URL",
  "EXPO_PUBLIC_SUPPORT_EMAIL",
  "EXPO_PUBLIC_CONTACT_EMAIL",
];

// Reads eas.json's text and returns the production build's EXPO_PUBLIC_*
// settings, plus a list of what's wrong with them (empty when all is well).
export function productionEnv(easJsonText) {
  let eas;
  try {
    eas = JSON.parse(easJsonText);
  } catch {
    return { env: {}, problems: ["eas.json isn't valid JSON."] };
  }
  const block = eas?.build?.production?.env ?? {};
  const env = {};
  for (const [key, value] of Object.entries(block)) {
    if (key.startsWith("EXPO_PUBLIC_") && typeof value === "string") env[key] = value.trim();
  }
  const problems = [];
  for (const key of REQUIRED_ENV) {
    if (!env[key]) problems.push(`${key} is missing from eas.json (build → production → env).`);
  }
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  if (url && (!url.startsWith("https://") || /localhost|127\.0\.0\.1/.test(url))) {
    problems.push(`EXPO_PUBLIC_SUPABASE_URL in eas.json should be the live https:// address, not "${url}".`);
  }
  const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (key && !key.startsWith("sb_publishable_")) {
    problems.push("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in eas.json must be the publishable key (sb_publishable_…), never the secret key.");
  }
  // Stripe: only ever the publishable key (pk_…) in the app; the secret key stays on the server.
  const stripeKey = env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (stripeKey && !stripeKey.startsWith("pk_")) {
    problems.push("EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in eas.json must be Stripe's publishable key (pk_test_… or pk_live_…), never the secret key.");
  }
  return { env, problems };
}

// The words after `npm run send-update --`: the message (all the words that
// aren't options, so it works with or without quotes) and --dry-run. npm
// keeps --dry-run for itself if the `--` is left out, and tells the script
// through npm_config_dry_run, so that counts too (it must never send by accident).
export function parseArgs(argv, env = {}) {
  let dryRun = env.npm_config_dry_run === "true";
  const words = [];
  const unknown = [];
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--") continue;
    else if (arg.startsWith("--")) unknown.push(arg);
    else words.push(arg);
  }
  return { dryRun, message: words.join(" ").trim(), unknown };
}

// The environment the bundler runs with: everything from the computer's own
// environment except any EXPO_PUBLIC_* values (and npm's dry-run flag), then
// eas.json's values on top. EXPO_NO_DOTENV stops a local .env file (which
// may point at a test database) from adding anything. EAS CLI's question
// about "server-side environment variables" is skipped, because the values
// come from eas.json instead.
export function bundleEnv(base, publicEnv) {
  const env = {};
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined || key.startsWith("EXPO_PUBLIC_") || key.toLowerCase() === "npm_config_dry_run") continue;
    env[key] = value;
  }
  return { ...env, ...publicEnv, EXPO_NO_DOTENV: "1", EAS_UPDATE_SKIP_ENVIRONMENT_CHECK: "1" };
}

// How to run `npx <args>` on any computer, Windows PowerShell included.
// Best: run npm's own npx-cli.js with this same Node, so no shell sits in
// between and the message reaches EAS exactly as typed (npx then quotes it
// correctly for the computer's shell). npm sets npm_execpath when it runs
// the script; the other two places are where Node's installers put npm on
// Windows and on Mac/Linux. If none is found, fall back to the shell with
// each argument quoted for it.
export function npxCommand(args, { execPath = process.execPath, npmExecPath = process.env.npm_execpath, platform = process.platform, exists = existsSync } = {}) {
  const candidates = [
    npmExecPath ? join(dirname(npmExecPath), "npx-cli.js") : null,
    join(dirname(execPath), "node_modules", "npm", "bin", "npx-cli.js"),
    join(dirname(execPath), "..", "lib", "node_modules", "npm", "bin", "npx-cli.js"),
  ].filter(Boolean);
  const cli = candidates.find((path) => exists(path));
  if (cli) return { command: execPath, args: [cli, ...args], shell: false };
  const windows = platform === "win32";
  const line = [windows ? "npx.cmd" : "npx", ...args.map((arg) => (windows ? quoteForCmd(arg) : quoteForSh(arg)))].join(" ");
  return { command: line, args: [], shell: true };
}

// Quoting for cmd.exe running a .cmd file (npx.cmd), as npm does it: quote
// for the program, then escape cmd's special characters twice (once for
// cmd, once for the .cmd file).
export function quoteForCmd(input) {
  let result = '"';
  for (let i = 0; i <= input.length; i++) {
    let slashes = 0;
    while (input[i] === "\\") {
      i++;
      slashes++;
    }
    if (i === input.length) {
      result += "\\".repeat(slashes * 2);
      break;
    }
    result += input[i] === '"' ? "\\".repeat(slashes * 2 + 1) + '"' : "\\".repeat(slashes) + input[i];
  }
  result += '"';
  const meta = /[ !%^&()<>|"]/g;
  return result.replace(meta, "^$&").replace(meta, "^$&");
}

// Quoting for sh (Mac and Linux): single quotes, with any ' written as '\''.
export function quoteForSh(input) {
  return `'${input.replace(/'/g, "'\\''")}'`;
}
