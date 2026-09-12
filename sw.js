const CACHE = 'fittracker-v4';

const REMINDER_OFFSET_DAYS = { daily: 1, weekly: 7, monthly: 30 };
let reminderTimer = null;

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

// ── RAPPEL ─────────────────────────────────────────────
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'setReminder') {
    armReminder(data.time || '08:00', data.freq || 'daily');
  } else if (data.type === 'clearReminder') {
    clearReminderTimer();
  }
});

function clearReminderTimer() {
  if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null; }
}

function armReminder(time, freq) {
  clearReminderTimer();
  const offset = REMINDER_OFFSET_DAYS[freq] || 1;
  const [h, m] = time.split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(h, m || 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + offset);

  const delay = target.getTime() - now.getTime();
  reminderTimer = setTimeout(() => {
    const label = freq === 'weekly' ? 'Cette semaine'
      : freq === 'monthly' ? 'Ce mois-ci'
      : 'Aujourd\u2019hui';
    self.registration.showNotification('FitTracker', {
      body: `${label}, pense à noter tes mensurations 💪`,
      icon: './assets/icons/icon-192.png',
      badge: './assets/icons/icon-192.png',
      tag: 'fittracker-reminder',
      renotify: true
    });
    armReminder(time, freq);
  }, delay);
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) { c.focus(); return; }
      }
      return self.clients.openWindow('./');
    })
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