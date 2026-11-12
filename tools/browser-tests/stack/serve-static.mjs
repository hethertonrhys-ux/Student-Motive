// Serves an Expo static export the way Vercel does: /map -> map.html, unknown paths -> +not-found.html.
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
const [dir, port] = [process.argv[2], Number(process.argv[3] || 8123)];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".ttf": "font/ttf", ".woff2": "font/woff2" };
// /e/abc -> e/[id].html (a dynamic route's page), like Vercel rewrites would.
import { readdirSync } from "node:fs";
function dynamicRoute(path) {
  const parts = path.split("/").filter(Boolean);
  let cur = dir;
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    const entries = existsSync(cur) ? readdirSync(cur) : [];
    const exact = last ? `${parts[i]}.html` : parts[i];
    if (entries.includes(exact)) { cur = join(cur, exact); continue; }
    const param = entries.find((e) => (last ? /^\[.*\]\.html$/ : /^\[.*\]$/).test(e));
    if (!param) return null;
    cur = join(cur, param);
  }
  return cur;
}
http.createServer((req, res) => {
  const path = decodeURIComponent(req.url.split("?")[0]);
  let file = join(dir, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) file = existsSync(join(dir, path + ".html")) ? join(dir, path + ".html") : dynamicRoute(path) ?? join(dir, "+not-found.html");
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log("serving", dir, "on", port));
