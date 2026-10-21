// Copies the QR decoder used by the website's camera scanner (zxing-wasm,
// via expo-camera → barcode-detector) into public/, so the website loads it
// from its own address instead of a public CDN. Runs after every install
// (postinstall), so the file always matches the installed library.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "..", "package.json"));
try {
  // The package folder that contains a resolved file (packages here don't all export package.json).
  const rootOf = (file, name) => {
    let dir = dirname(file);
    while (dir !== dirname(dir) && !dir.endsWith(`${sep}${name}`)) dir = dirname(dir);
    return dir;
  };
  const camera = dirname(require.resolve("expo-camera/package.json"));
  const detector = rootOf(require.resolve("barcode-detector", { paths: [camera] }), "barcode-detector");
  const lib = rootOf(require.resolve("zxing-wasm/reader", { paths: [detector] }), "zxing-wasm");
  const from = join(lib, "dist", "reader", "zxing_reader.wasm");
  const to = join(here, "..", "public", "zxing_reader.wasm");
  if (!existsSync(from)) throw new Error(`not found: ${from}`);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log("QR decoder copied to public/zxing_reader.wasm");
} catch (error) {
  // Never fail an install over this: the scanner then falls back to the CDN.
  console.warn(`Couldn't copy the QR decoder (${error instanceof Error ? error.message : error}). The website's scanner will load it from the CDN.`);
}
