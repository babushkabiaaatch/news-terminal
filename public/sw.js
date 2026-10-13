// Caches the app shell so the app opens instantly (even offline). Never caches /api/.
const V = "nt-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  e.respondWith(
    caches.open(V).then(async (c) => {
      const hit = await c.match(e.request);
      const net = fetch(e.request)
        .then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; })
        .catch(() => hit);
      return hit || net; // stale-while-revalidate
    })
  );
});
