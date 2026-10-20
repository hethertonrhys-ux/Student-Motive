// Screenshots of the web build at phone width (390px), in light and dark
// mode, for checking a design change and showing it in a pull request.
//
//   npx expo export --platform web --output-dir /tmp/web     (from apps/mobile)
//   node scripts/screenshots.mjs /tmp/web /tmp/shots / /design /societies
//   FULL=1 node scripts/screenshots.mjs ...                   (whole page, not one screen)
//
// Each path gives <name>-light.png and <name>-dark.png in the output folder.
// /design (the style guide) is admin-only in a normal build; export with
// --dev to screenshot it without logging in.
// It needs Playwright and a Chromium (`npm install -g playwright` and
// `npx playwright install chromium`, or CHROMIUM=<path to chrome>); they
// aren't app dependencies, so the app's install stays the same.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";

// Playwright from this project if it's there, otherwise the global install.
async function loadPlaywright() {
  try {
    // Not an app dependency (see above), so the linter can't find it; that's expected.
    // eslint-disable-next-line import/no-unresolved
    return await import("playwright");
  } catch {
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    return createRequire(join(root, "noop.js"))("playwright");
  }
}

const [dist, out, ...paths] = process.argv.slice(2);
if (!dist || !out || paths.length === 0) {
  console.error("Usage: node scripts/screenshots.mjs <web build folder> <output folder> <path> [<path>...]");
  process.exit(1);
}
mkdirSync(out, { recursive: true });

// A small server for the static build: /lse is lse.html, /hub is hub/index.html.
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff2": "font/woff2", ".ico": "image/x-icon" };
const server = createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const file = [url, `${url}.html`, join(url, "index.html")].map((p) => join(resolve(dist), p)).find((f) => existsSync(f) && statSync(f).isFile()) ?? join(dist, "+not-found.html");
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(0);
const port = server.address().port;

const { chromium } = await loadPlaywright();
// Behind an HTTPS proxy (cloud sessions), send only https through it, so
// the local server is reached directly and the live database still works.
const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM,
  args: proxy ? [`--proxy-server=https=${proxy.replace(/^https?:\/\//, "")}`] : [],
});
for (const scheme of ["light", "dark"]) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme });
  for (const path of paths) {
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}${path}`, { waitUntil: "networkidle" }).catch(() => {});
    // Fonts, icons and data settle after the first paint.
    await page.waitForTimeout(1500);
    const name = `${path === "/" ? "home" : path.slice(1).replace(/[^\w-]+/g, "_")}-${scheme}.png`;
    if (process.env.FULL === "1") {
      // The app scrolls inside its own frame, not the page, so make the
      // window as tall as the tallest scrolling content and shoot that.
      const height = await page.evaluate(() => Math.max(...[...document.querySelectorAll("*")].map((el) => el.scrollHeight)));
      await page.setViewportSize({ width: 390, height: Math.min(height, 16000) });
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: join(out, name) });
    console.log(join(out, name));
    await page.close();
  }
  await context.close();
}
await browser.close();
server.close();
