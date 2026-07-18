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
