/* Glitch Q — owner alerts (service worker for admin.html).
   It does exactly two things: show a notification when the Worker pushes a new-order message, and open the panel when the notification is tapped.
   There is no "fetch" handler and nothing is cached or intercepted, so the store and the panel load exactly as they would without it. */
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (_) { m = {}; }
  if (!m || typeof m !== 'object') m = {};
  const kind = String(m.t || '').slice(0, 12);
  const title = String(m.title || 'Glitch Q').slice(0, 120);
  e.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body: String(m.body || '').slice(0, 300),
      tag: String(m.tag || 'gq').slice(0, 80),
      renotify: true,                                   // a new order with the same tag still rings again
      requireInteraction: kind === 'order',             // stays on screen until the owner sees it (desktop / Android)
      vibrate: [250, 120, 250, 120, 500],
      dir: 'rtl', lang: 'ar',
      icon: 'assets/logo/icon-512.png',
      badge: 'assets/logo/favicon-32.png',
      timestamp: Date.now(),
      data: { t: kind, oid: String(m.oid || '').slice(0, 40) },
    });
    // if the panel is open, let it ring too (it also hears the database directly; the page ignores a repeat)
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    cs.forEach(c => c.postMessage({ t: 'push', kind, oid: String(m.oid || '').slice(0, 40), title, body: String(m.body || '').slice(0, 300) }));
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL('admin.html#orders', self.registration.scope).href;
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cs) {
      if (/\/admin(?:\.html)?(?:[?#]|$)/.test(c.url)) { try { c.postMessage({ t: 'open-orders' }); } catch (_) {} return c.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
