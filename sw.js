// /sw.js — CariSchool minimal service worker.
//
// This exists ONLY to satisfy Chrome/Android's installability requirement
// (a registered service worker with a fetch handler is one of the checks
// behind the native "Add to Home Screen" / install prompt). It deliberately
// does NOT cache anything.
//
// WHY no caching: CariSchool is a live-Supabase-driven site with no build
// step -- school data, fees, claim status, and premium content change
// constantly. A caching service worker here would risk showing a parent or
// school owner stale/wrong data (an old fee, a since-claimed profile still
// showing "unclaimed", etc). If real offline support is ever wanted later,
// add a deliberate caching strategy for genuinely static assets only
// (logo, favicon) -- never for HTML pages or API/Supabase responses, and
// never as a silent "improvement" to this file.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // pass-through -- browser handles every request normally

// Added 2026-08-24 -- Phase A of push notifications: school-side only,
// triggered by api/notify-whatsapp-click.js. Payload is a plain JSON
// object { title, body, url }, no encryption-format assumptions beyond
// what the Push API itself already handles.
self.addEventListener('push', (event) => {
  let data = { title: 'CariSchool', body: 'Anda ada kemaskini baharu.', url: '/kemaskini.html' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/carischool%20logo%20400x400.png',
      badge: '/carischool%20favicon%2032x32.png',
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/kemaskini.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
