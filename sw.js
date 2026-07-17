/* Service worker : met l'app en cache pour qu'elle fonctionne sans réseau à la salle. */
const CACHE = "sportapp-v13";
const ASSETS = [
  ".",
  "index.html",
  "css/style.css",
  "js/store.js",
  "js/ui.js",
  "js/lock.js",
  "js/cloud.js",
  "js/chrono.js",
  "js/stats.js",
  "js/planning.js",
  "js/coach.js",
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

/* Réseau d'abord (les mises à jour sont visibles dès la réouverture),
   cache en secours (l'app fonctionne toujours hors-ligne à la salle). */
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (!e.request.url.startsWith(self.location.origin)) return; // ne pas intercepter GitHub & co
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const copie = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copie));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request, { ignoreSearch: true }).then(hit =>
          hit || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error())
        )
      )
  );
});
