// Last Stand service worker: offline, cache-first, with an "update available" handshake.
// The cache name is stamped by tools/build.py from a hash of all assets, so ANY change makes a new worker.
// A new worker takes over as soon as it has cached the new files (the newest version is used from the next open).
// The game also checks version.json (never cached) and shows an UPDATE banner so you can switch right away.
// Saves live in localStorage and are never touched by any of this.
const CACHE = "last-stand-9f19b93bde";
const ASSETS = [
  './',
  './manifest.webmanifest',
  './peerjs.min.js',
  './fonts/blackops.woff2',
  './fonts/chakra-500.woff2',
  './fonts/chakra-700.woff2',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/favicon-64.png'
];

self.addEventListener("install", (e) => {
  // cache: "reload" skips the browser's HTTP cache so the new version really is the new files
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((a) => new Request(a, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("last-stand-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // never cache cross-origin (online play signalling)
  if (url.pathname.endsWith("/version.json")) return; // always ask the network: this is how the game spots a new version
  // Serve only from THIS version's cache, so files from two versions never mix. Misses go to the network.
  e.respondWith(
    caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok && url.pathname.indexOf("/sw.js") < 0) c.put(req, res.clone());
      return res;
    }).catch(() => (req.mode === "navigate" ? c.match("./") : undefined))))
  );
});
