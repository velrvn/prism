/* ============================================================
   PRISM — Service Worker
   - Precaches the app shell for full offline use
   - Never touches the Bible data cache (managed by js/data.js)
   ============================================================ */

const VERSION = 'v1.0.0';
const STATIC_CACHE = `prism-static-${VERSION}`;
const RUNTIME_CACHE = `prism-runtime-${VERSION}`;
const BIBLE_CACHE_PREFIX = 'prism-bible-'; // protected — never deleted on update

const PRECACHE_URLS = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/config.js',
  './js/utils.js',
  './js/storage.js',
  './js/data.js',
  './js/share.js',
  './js/app.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

/* ---------- Install: precache app shell ---------- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .catch(err => console.warn('Precache partial failure:', err))
  );
});

/* ---------- Activate: clean old caches, keep Bible data ---------- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => !k.startsWith(BIBLE_CACHE_PREFIX) && k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------- Manual update hook ---------- */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/* ---------- Fetch strategies ---------- */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Bible XML is cached by the data layer (Cache Storage) — let it pass through
  if (url.hostname === 'raw.githubusercontent.com' || url.hostname === 'cdn.jsdelivr.net') return;

  // Same-origin navigation: network-first → cached page → offline page
  if (url.origin === self.location.origin && req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(async () => {
          return (await caches.match(req))
            || (await caches.match('./index.html'))
            || (await caches.match('./offline.html'))
            || Response.error();
        })
    );
    return;
  }

  // Same-origin assets: cache-first with background refresh
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached => {
        const network = fetch(req)
          .then(res => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then(c => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Other cross-origin GETs: cache-first runtime cache
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => Response.error());
    })
  );
});