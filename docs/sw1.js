// Service Worker: Offline-Cache (network-first) und Push-Anzeige.
const CACHE = 'briefing-v5';
const SHELL = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first: immer frische Briefings, bei fehlender Verbindung der letzte Stand aus dem Cache.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
      )
  );
});

// Auf iOS muss jede Push-Nachricht sichtbar angezeigt werden, sonst widerruft Apple die Anmeldung.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Dein Briefing ist da', {
      body: data.body || '',
      icon: 'icons/icon-192.png',
      tag: data.tag || 'briefing'
    })
  );
});

// Beim Antippen öffnet sich immer die Startseite der App ("Heute" zeigt das neueste Briefing).
// Die Adresse kommt nur aus dem Scope des Service Workers und nie aus der Push-Nachricht, damit eine
// falsche oder relative Adresse in der Nachricht nichts kaputt machen kann. Auf iOS ist navigate()
// auf bestehenden Fenstern unzuverlässig, deshalb wird dort nur fokussiert und eine Nachricht gesendet.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const scope = self.registration.scope;
  event.waitUntil(
    (async () => {
      try {
        const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const existing = list.find((c) => c.url.startsWith(scope));
        if (existing) {
          await existing.focus();
          existing.postMessage({ type: 'show-latest' });
          return;
        }
      } catch {
        /* fällt auf openWindow zurück */
      }
      await self.clients.openWindow(scope);
    })()
  );
});
