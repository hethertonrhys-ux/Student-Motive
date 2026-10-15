// The map library runs part of its work in a separate background file ("worker").
// Next.js doesn't bundle that file, so we copy it into public/ where the browser can load it.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const from = "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs";
const to = "public/maplibre-gl-worker.mjs";

if (!existsSync(from)) {
  console.error(`Can't find ${from}. Run "npm install" first.`);
  process.exit(1);
}
mkdirSync("public", { recursive: true });
copyFileSync(from, to);
