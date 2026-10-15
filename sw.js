const VERSION = 'v1.0.4';
const CACHE_NAME = `prism-cache-${VERSION}`;
const PRECACHE_URLS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './css/styles.css', './js/config.js', './js/utils.js', './js/storage.js', './js/data.js', './js/share.js', './js/app.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.hostname === 'raw.githubusercontent.com' || url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => { 
      if (response && response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)); } 
      return response; 
    })));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(fetch(event.request).then((response) => { 
      if (response && response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)); } 
      return response; 
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html'))));
  }
});
