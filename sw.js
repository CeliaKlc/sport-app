/* Service worker : met l'app en cache pour qu'elle fonctionne sans réseau à la salle. */
const CACHE = "sportapp-v2";
const ASSETS = [
  ".",
  "index.html",
  "css/style.css",
  "js/store.js",
  "js/ui.js",
  "js/chrono.js",
  "js/stats.js",
  "js/planning.js",
  "js/profil.js",
  "js/app.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit =>
      hit ||
      fetch(e.request).catch(() =>
        e.request.mode === "navigate" ? caches.match("index.html") : Response.error()
      )
    )
  );
});
