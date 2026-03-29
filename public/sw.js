const CACHE = 'stash-panda-v1'

const APP_SHELL = [
  '/',
  '/css/app.css',
  '/js/router.js',
  '/js/db.js',
  '/js/components/quantity-stepper.js',
  '/manifest.json',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle GET requests from our own origin
  if (request.method !== 'GET' || url.origin !== location.origin) return

  // Let API and SSE requests go to the network directly
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/events')) return

  // Cache-first for app shell assets; network-first with cache fallback for everything else
  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(request)
      try {
        const fresh = await fetch(request)
        if (fresh.ok) cache.put(request, fresh.clone())
        return fresh
      } catch {
        return cached ?? new Response('Offline', { status: 503 })
      }
    })
  )
})

// Background sync: replay queued offline mutations when back online
self.addEventListener('sync', event => {
  if (event.tag === 'stash-sync') {
    event.waitUntil(replayQueue())
  }
})

async function replayQueue() {
  // Queue is managed by /js/db.js — broadcast a message to clients to trigger replay
  const all = await self.clients.matchAll({ type: 'window' })
  for (const client of all) {
    client.postMessage({ type: 'SYNC_READY' })
  }
}
