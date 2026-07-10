const CACHE_NAME = "nb-transcribe-shell-v2";
const APP_SHELL = ["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  const cachePut = (request, response) => {
    if (response && response.status === 200 && response.type === "basic") {
      const responseClone = response.clone();
      // waitUntil holder service workeren i live til cache-skrivingen er ferdig
      event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone))
      );
    }
    return response;
  };

  // Nettverk først for sidenavigasjoner slik at nye deploys når brukeren;
  // cache brukes bare som offline-fallback.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => cachePut(event.request, response))
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match("/"))
        )
    );
    return;
  }

  // Cache først for statiske ressurser (hashet av Next.js, trygt å cache).
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request).then((response) => cachePut(event.request, response));
    })
  );
});
