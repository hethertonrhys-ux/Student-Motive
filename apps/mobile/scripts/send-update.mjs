// Sends the app's current code to phones as an over-the-air update (EAS
// Update), with no new build and no App Store review.
//
//   npm run send-update -- "Fixed the Hub button"      (from apps/mobile)
//   npm run send-update -- --dry-run                   (checks, sends nothing)
//
// It goes to the "production" channel: every phone with a production build,
// which means TestFlight testers and App Store users alike.
//
// Why a script and not plain `eas update`: the update's JavaScript is
// bundled on this computer, and EAS doesn't use the settings in eas.json's
// build profiles for that. Without them the bundle would have no database
// address and the app would stop at launch on every phone that downloaded
// it. So this takes them from eas.json (build → production → env), refuses
// to go on if any is missing, and passes them to EAS itself.
//
// --dry-run bundles the iPhone version into a temporary folder instead of
// sending, and checks the bundle has the database address and key in it.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEnv, npxCommand, parseArgs, productionEnv } from "./update-env.mjs";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function stop(lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

function run(args, env) {
  const { command, args: realArgs, shell } = npxCommand(args);
  return new Promise((resolve) => {
    const child = spawn(command, realArgs, { cwd: appDir, env, stdio: "inherit", shell });
    child.on("error", (error) => {
      console.error(`Couldn't start npx: ${error.message}`);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

// The finished iPhone bundle must carry the database address and key.
function checkBundle(outDir, env) {
  const metadata = JSON.parse(readFileSync(join(outDir, "metadata.json"), "utf8"));
  const bundlePath = metadata?.fileMetadata?.ios?.bundle;
  if (!bundlePath) return { ok: false, missing: ["the iPhone bundle itself"], bundle: null };
  const bundle = join(outDir, bundlePath);
  const text = readFileSync(bundle).toString("latin1");
  const missing = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"].filter((key) => !text.includes(env[key]));
  return { ok: missing.length === 0, missing, bundle };
}

async function main() {
  const { dryRun, message, unknown } = parseArgs(process.argv.slice(2), process.env);
  if (unknown.length) stop([`Unknown option: ${unknown.join(" ")}. The only option is --dry-run.`]);
  if (!dryRun && !message) {
    stop(['Say what changed, in quotes. For example:', '  npm run send-update -- "Fixed the Hub button"']);
  }

  const { env: publicEnv, problems } = productionEnv(readFileSync(join(appDir, "eas.json"), "utf8"));
  if (problems.length) stop(["Not sending. Fix these in eas.json first:", ...problems.map((p) => `  - ${p}`)]);
  const env = bundleEnv(process.env, publicEnv);
  console.log(`Using eas.json's production settings: ${Object.keys(publicEnv).join(", ")}.`);
  console.log(`Database: ${publicEnv.EXPO_PUBLIC_SUPABASE_URL}`);

  if (dryRun) {
    const outDir = mkdtempSync(join(tmpdir(), "function-update-check-"));
    console.log(`Dry run: bundling the iPhone app into ${outDir} (nothing is sent).`);
    const code = await run(["expo", "export", "--platform", "ios", "--output-dir", outDir], env);
    if (code !== 0) stop([`The bundle failed (exit code ${code}). Nothing was sent.`]);
    const check = checkBundle(outDir, env);
    if (!check.ok) stop([`The bundle is missing ${check.missing.join(" and ")}. Don't send this update.`]);
    console.log(`Checked: ${check.bundle} has the database address and key from eas.json.`);
    console.log("Dry run finished. Nothing was sent.");
    return;
  }

  console.log(`Sending to every phone on the production channel (TestFlight and the App Store): "${message}"`);
  const code = await run(["eas-cli", "update", "--channel", "production", "--message", message], env);
  if (code !== 0) process.exit(code);
  console.log("Sent. Phones get it the next time the app is opened, then show \"A new version of Function is ready\" with a Restart button.");
}

await main();
