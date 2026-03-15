const CACHE_NAME = "novahub-cache-v1";

const urlsToCache = [
"/",
"/index.html",
"/offline.html",
"/start/style.css",
"/start/script.js",
"/start/icon-192.png",
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

fetch(event.request)
.then(response => {

const clone = response.clone();

caches.open(CACHE_NAME)
.then(cache => cache.put(event.request, clone));

return response;

})
.catch(() => {

return caches.match(event.request)
.then(res => {

return res || caches.match("/offline.html");

});

})

);

});