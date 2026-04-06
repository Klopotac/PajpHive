// sw.js — HiveVoice Service Worker
// Provides offline caching for the app shell

const CACHE_NAME = "hivevoice-v2";

const APP_SHELL = [
  "/",
  "/index.html",
  "/login.html",
  "/register.html",
  "/hive.html",
  "/hive-detail.html",
  "/calendar.html",
  "/partners.html",
  "/settings.html",
  "/css/app.css",
  "/js/firebase-config.js",
  "/js/auth.js",
  "/js/db.js",
  "/js/storage.js",
  "/js/offline.js",
  "/js/recording.js",
  "/js/ui.js",
  "/manifest.json"
];

// Install: cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for Firebase, cache-first for app shell
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Always go network-first for Firebase APIs
  if (
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebase.com") ||
    url.hostname.includes("firebaseapp.com") ||
    url.hostname.includes("gstatic.com")
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for app shell assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        if (response && response.status === 200 && event.request.method === "GET") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// Push notifications (Phase 2)
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "HiveVoice";
  const options = {
    body: data.body || "New inspection note added.",
    icon: "/icon-192.png"
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
