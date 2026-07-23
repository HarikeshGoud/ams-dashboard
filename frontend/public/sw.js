// SHC Dashboard service worker — network-first so the installed app always shows
// the latest deploy, with an offline fallback to the last-seen version.
const CACHE = 'shc-v2'
const SHELL = ['/', '/manifest.json']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)

  // IMPORTANT: only ever touch same-origin GETs. API calls (different origin —
  // the Azure backend), and every POST/PUT/DELETE (logins, photo uploads, writes)
  // pass straight through and are NEVER cached — this keeps auth/data correct and secure.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // Hashed Vite build assets are immutable — cache-first (fast, safe forever).
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(req, clone))
          return res
        })
      )
    )
    return
  }

  // Everything else same-origin (pages, manifest, icons): network-first so the
  // app auto-updates on every deploy; fall back to cache when offline, then to the shell.
  e.respondWith(
    fetch(req)
      .then((res) => {
        const clone = res.clone()
        caches.open(CACHE).then((c) => c.put(req, clone))
        return res
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('/')))
  )
})
