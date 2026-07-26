/**
 * Carbonify service worker — offline app shell + asset caching.
 *
 * Strategy:
 *  - Precache the stable shell (index.html, manifest, logo) on install.
 *  - Navigations: network-first, falling back to the cached shell when offline
 *    (so the SPA still boots and can show cached data / an offline notice).
 *  - Hashed build assets (/js, /assets, *.css/js): stale-while-revalidate.
 *  - Everything else (Supabase API, cross-origin, OSM tiles, non-GET): passed
 *    straight to the network and never cached.
 *
 * Bump CACHE_VERSION to invalidate old caches on the next activate.
 */
// Bumped to v2 with the icon rework. Until now these caches were deleted a
// second after every page load by a stray block in main.js, so no user has ever
// held a populated v1 cache.
const CACHE_VERSION = 'v2'
const SHELL_CACHE = `carbonify-shell-${CACHE_VERSION}`
const ASSET_CACHE = `carbonify-assets-${CACHE_VERSION}`
const SHELL_URLS = ['/', '/index.html', '/manifest.json', '/carbonify-logo.png', '/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      // Best-effort: a missing asset must not abort the whole install.
      await Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE])
      const names = await caches.keys()
      await Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)))
      await self.clients.claim()
    })(),
  )
})

// Allow the page to trigger an immediate update.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

function isHashedAsset(url) {
  return (
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.woff2')
  )
}

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const fresh = await fetch(request)
    // Keep the latest shell for offline navigations.
    cache.put('/index.html', fresh.clone()).catch(() => {})
    return fresh
  } catch {
    return (await cache.match(request)) || (await cache.match('/index.html')) || (await cache.match('/')) || Response.error()
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone()).catch(() => {})
      return response
    })
    .catch(() => null)
  return cached || (await network) || Response.error()
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Only handle our own origin; never intercept Supabase, PayMongo, OSM tiles, etc.
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request))
    return
  }

  if (isHashedAsset(url)) {
    event.respondWith(staleWhileRevalidate(request))
  }
})
