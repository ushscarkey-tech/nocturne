// Nocturne's service worker: the app opens even without a connection.
// Pages are fetched fresh when online (so a new version shows up at once)
// and fall back to the last copy offline; hashed build files, fonts and
// textures never change, so they come straight from the cache.
const PAGES = "nocturne-pages-v1";
const ASSETS = "nocturne-assets-v1";
const SCOPE = new URL(self.registration.scope).pathname;
const FOREVER = ["_next/static/", "fonts/", "textures/", "icons/"].map((p) => SCOPE + p);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.add(SCOPE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== PAGES && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
  if (url.pathname === SCOPE + "sw.js") return;

  if (FOREVER.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  event.respondWith(
    caches.open(PAGES).then(async (cache) => {
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = (await cache.match(req, { ignoreSearch: req.mode === "navigate" })) ?? (req.mode === "navigate" ? await cache.match(SCOPE) : undefined);
        if (hit) return hit;
        throw err;
      }
    }),
  );
});
