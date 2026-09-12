const CACHE = 'fittracker-v2';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './vendor/chart.umd.min.js',
  './assets/css/style.css',
  './assets/js/app.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // Navigations : réseau d'abord, fallback cache pour l'offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(resp => {
          const copy = resp.clone();
          return caches.open(CACHE)
            .then(cache => cache.put('./index.html', copy))
            .then(() => resp);
        })
        .catch(() =>
          caches.match('./index.html').then(r => r)
        )
    );
    return;
  }

  // Assets : cache d'abord + rafraîchissement en arrière-plan
  event.respondWith(
    caches.match(request).then(cached => {
      const refresh = fetch(request)
        .then(resp => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || refresh;
    })
  );
});