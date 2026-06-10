const APP_CACHE_NAME = "ipad-slideshow-pwa-app-shell-v1";

const APP_SHELL_URLS = [
  "/",
  "/settings/",
  "/admin/",
  "/player/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

function isSameOriginGetRequest(request) {
  if (request.method !== "GET") {
    return false;
  }

  const url = new URL(request.url);
  return url.origin === self.location.origin;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== APP_CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (!isSameOriginGetRequest(request)) {
    return;
  }

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) =>
          caches.open(APP_CACHE_NAME).then((cache) => {
            cache.put(request, response.clone());
            return response;
          }),
        )
        .catch(() =>
          caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }

            return caches.match(url.pathname).then((pathCachedResponse) => {
              if (pathCachedResponse) {
                return pathCachedResponse;
              }

              return caches.match("/player/");
            });
          }),
        ),
    );

    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request).then((response) => {
          if (!response.ok) {
            return response;
          }

          return caches.open(APP_CACHE_NAME).then((cache) => {
            cache.put(request, response.clone());
            return response;
          });
        });
      }),
    );
  }
});
