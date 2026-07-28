// scriptorium service worker — offline app shell (subway-proof reviewing).
// Shell (/, /data.json) is network-first with a short timeout so a live session
// always sees reseeded data, but a dead network falls back to the last good copy.
// Fonts are cache-first (immutable). /api/* is never intercepted — the page's
// localStorage outbox owns write durability, and /api/state has its own mirror.
const VER = "scriptorium-v1";
const SHELL = ["/", "/data.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(VER)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VER).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(req) {
  const cache = await caches.open(VER);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(req, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) void cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(VER);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") void cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    if (url.pathname.startsWith("/api/")) return;
    if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/data.json") {
      e.respondWith(networkFirst(e.request));
    }
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(cacheFirst(e.request));
  }
});
