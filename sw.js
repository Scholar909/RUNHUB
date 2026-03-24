const CACHE_NAME = "novahub-cache-v21";

const urlsToCache = [
"/",
"/index.html",
"/offline.html",
"/start/style.css",
"/start/script.js",
"/start/splash-logo.png",
"/start/icon-512.png"
];

self.addEventListener("install", event => {

event.waitUntil(
caches.open(CACHE_NAME)
.then(cache => {
return cache.addAll(urlsToCache);
})
);

self.skipWaiting();

});


self.addEventListener("activate", event => {

event.waitUntil(
caches.keys().then(keys => {
return Promise.all(
keys.filter(key => key !== CACHE_NAME)
.map(key => caches.delete(key))
);
})
);

self.clients.claim();

});


self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse.clone()));
        return networkResponse;
      });
      // Return cached response if available, otherwise wait for network
      return cachedResponse || fetchPromise;
    }).catch(() => caches.match("/offline.html"))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});