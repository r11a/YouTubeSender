const CACHE = "youtube-sender-v5";
const SHELL = ["./", "./styles.css?v=0.2.2", "./theme-granite.css?v=0.2.2", "./app.js?v=0.2.2", "./icon-192.png?v=0.2.2", "./manifest.webmanifest?v=0.2.2"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => { if (event.request.method !== "GET" || new URL(event.request.url).pathname.includes("/api/")) return; event.respondWith(fetch(event.request).then((response) => { const clone = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, clone)); return response; }).catch(() => caches.match(event.request).then((cached) => cached || caches.match("./")))); });
