const CACHE_NAME = "vision-assist-shell";
const APP_SHELL = [
    "/",
    "/index.html",
    "/app",
    "/app.html",
    "/mobile.css",
    "/mobile.js",
    "/manifest.webmanifest",
    "/pwa.js",
    "/icons/vision-assist-3.svg",
    "/icons/vision-assist-3-192.png",
    "/icons/vision-assist-3-512.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => Promise.all(
            cacheNames
                .filter((cacheName) => cacheName !== CACHE_NAME)
                .map((cacheName) => caches.delete(cacheName))
        ))
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    const requestUrl = new URL(event.request.url);

    if (
        event.request.method !== "GET" ||
        requestUrl.origin !== self.location.origin ||
        requestUrl.pathname.startsWith("/api/")
    ) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                if (!networkResponse.ok) {
                    return networkResponse;
                }

                const responseCopy = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
                return networkResponse;
            })
            .catch(() => caches.match(event.request).then(
                (cachedResponse) => cachedResponse || Response.error()
            ))
    );
});
