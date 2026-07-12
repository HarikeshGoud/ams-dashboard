// Minimal service worker — exists only to satisfy PWA installability requirements
// (Android's "Add to Home Screen" requires a registered SW with a fetch handler).
// No caching: every request passes straight through to the network as normal.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
