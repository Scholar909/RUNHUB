importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyC7onB0OptTyu-J6J1PwU6zX799tQIjh4k",
  authDomain: "affiliate-app-dab95.firebaseapp.com",
  projectId: "affiliate-app-dab95",
  storageBucket: "affiliate-app-dab95.firebasestorage.app",
  messagingSenderId: "510180440268",
  appId: "1:510180440268:web:99be47162857f635d8ea69"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
    icon: "/start/icon-512.png",
    data: payload.data?.url
  });
});

const CACHE_NAME = "novahub-cache-v9";

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

self.addEventListener("push", event => {
    if (!event.data) return;

    const data = event.data.json();

    self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/start/icon-512.png",
        data: data.url
    });
});

self.addEventListener("notificationclick", event => {
    event.notification.close();

    event.waitUntil(
        clients.openWindow(event.notification.data || "/")
    );
});