// Function's service worker (the home-screen web app).
// 1. Push notifications: shows them and opens the right page when tapped.
// 2. Caching is added by the app build (see the end of this file).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = { title: "Function", body: "", url: "/" };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

// ---- Caching, so the home-screen app opens fast and works on a bad signal ----
// Every JS/CSS/font file the build makes has a unique fingerprinted name,
// so once fetched it never changes: keep those for good ("cache first").
// Pages (HTML) are fetched from the network first so new versions show up,
// with the cached copy as a fallback when offline. Map tiles, glyphs and
// sprites are kept for a while too, with a cap so they don't fill the phone.
const STATIC = "fn-static-v1";
const PAGES = "fn-pages-v1";
const TILES = "fn-tiles-v1";
const TILE_LIMIT = 600;

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => ![STATIC, PAGES, TILES].includes(k)).map((k) => caches.delete(k)))));
});

const isStatic = (url) => url.origin === self.location.origin && (url.pathname.startsWith("/_expo/static/") || url.pathname.startsWith("/assets/") || /\.(png|ico|webmanifest)$/.test(url.pathname));
const isTile = (url) => /openfreemap\.org$|tiles\.openfreemap\.org$/.test(url.hostname) || url.pathname.endsWith(".pbf") || /\/sprites?\//.test(url.pathname) || /\/fonts\//.test(url.pathname);

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > limit) await Promise.all(keys.slice(0, keys.length - limit).map((k) => cache.delete(k)));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/rest/") || url.pathname.startsWith("/auth/")) return;

  if (isStatic(url)) {
    event.respondWith(caches.open(STATIC).then(async (cache) => (await cache.match(req)) || fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })));
    return;
  }
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(fetch(req).then((res) => { if (res.ok) caches.open(PAGES).then((c) => c.put(req, res.clone())); return res; }).catch(async () => (await caches.match(req)) || (await caches.match("/")) || Response.error()));
    return;
  }
  if (isTile(url)) {
    event.respondWith(caches.open(TILES).then(async (cache) => {
      const cached = await cache.match(req);
      const fresh = fetch(req).then((res) => { if (res.ok) { cache.put(req, res.clone()); trim(TILES, TILE_LIMIT); } return res; }).catch(() => cached);
      return cached || fresh;
    }));
  }
});
