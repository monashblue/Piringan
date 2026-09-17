const CACHE_NAME = "piringan-shell-v1";
const SHELL_FILES = [
  "/",
  "/index.html",
  "/styles.css",
  "/script.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Shell files: cache-first (fast, works offline).
// Everything else (API calls, YouTube embed, fonts): network-first, untouched.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isShellFile = SHELL_FILES.includes(url.pathname) && url.origin === self.location.origin;

  if (!isShellFile) return; // let the browser handle it normally

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
