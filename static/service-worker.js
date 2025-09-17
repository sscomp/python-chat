const CACHE_NAME = "chatapp-cache-v1";
const urlsToCache = [
  "/",
  "/static/style.css",
  "/static/main.js",
  "/static/manifest.json"
];

// 安裝 Service Worker → 快取基本檔案
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// 攔截請求 → 優先回快取，沒有才去網路
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});