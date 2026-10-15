// The map library runs part of its work in a separate background file ("worker").
// Next.js doesn't bundle that file, so we copy it into public/ where the browser can load it.
import { copyFileSync } from "node:fs";

copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre-gl-worker.mjs");
