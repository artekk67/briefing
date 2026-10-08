// Service Worker: Offline-Cache (network-first) und Push-Anzeige.
const CACHE = 'briefing-v3';
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
      tag: data.tag || 'briefing',
      data: { url: data.url || './' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
      const existing = list.find((c) => c.url.startsWith(self.registration.scope));
      if (existing) {
        await existing.focus();
        try {
          if ('navigate' in existing) await existing.navigate(target);
        } catch {
          /* Navigation nicht möglich, Fenster bleibt fokussiert */
        }
        return;
      }
      await self.clients.openWindow(target);
    })
  );
});
