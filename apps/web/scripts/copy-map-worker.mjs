// The map library runs part of its work in a separate background file ("worker").
// Next.js doesn't bundle that file, so we copy it into public/ where the browser can load it.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// Found wherever npm put the library (this app's node_modules, or the
// repository root's in the monorepo).
const from = join(dirname(createRequire(import.meta.url).resolve("maplibre-gl/package.json")), "dist/maplibre-gl-worker.mjs");
const to = "public/maplibre-gl-worker.mjs";

if (!existsSync(from)) {
  console.error(`Can't find ${from}. Run "npm install" first.`);
  process.exit(1);
}
mkdirSync("public", { recursive: true });
copyFileSync(from, to);
