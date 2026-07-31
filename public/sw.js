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
const CACHE_VERSION = 'v4'
const SHELL_CACHE = `carbonify-shell-${CACHE_VERSION}`
const ASSET_CACHE = `carbonify-assets-${CACHE_VERSION}`
const SHELL_URLS = ['/', '/index.html', '/manifest.json', '/carbonify-logo.png', '/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      // Best-effort: a missing asset must not abort the whole install.
      // Fetch first, then vet the response — `cache.add()` would throw on a
      // `Vary: *` reply, which the dev server sends.
      await Promise.allSettled(
        SHELL_URLS.map(async (url) => {
          const response = await fetch(url, { cache: 'reload' })
          await safePut(cache, url, response)
        }),
      )
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

/**
 * The Cache API REFUSES any response whose `Vary` header contains `*`, and it
 * refuses it by throwing — `TypeError: Failed to execute 'put' on 'Cache':
 * Vary header contains *`. Vite's dev server sends exactly that header on some
 * responses, so every navigation logged an uncaught rejection in development.
 *
 * Checking first is better than catching after: `cache.add()` fetches the URL
 * itself, so a rejection there has already spent the request, and the thrown
 * TypeError is indistinguishable from a real bug in the log.
 */
function isCacheable(response) {
  if (!response || !response.ok) return false
  // Opaque responses (no-cors) report status 0 and cannot be validated.
  if (response.type === 'opaque' || response.type === 'error') return false
  const vary = response.headers.get('Vary')
  return !(vary && vary.includes('*'))
}

/** Never throws. A cache write is an optimisation, never a reason to fail. */
async function safePut(cache, key, response) {
  if (!isCacheable(response)) return
  try {
    await cache.put(key, response)
  } catch {
    /* quota, opaque response, or a Vary we did not anticipate — ignore */
  }
}

/**
 * Google Fonts — the ONE cross-origin exception, and it earns it.
 *
 * The whole UI is iconography from Material Symbols, which renders by
 * ligature. If that font is unavailable the icons do not degrade to blank —
 * they degrade to the literal words "check_circle", "menu_book", "visibility"
 * scattered through the interface. Offline, with no font cached, that is what
 * an installed PWA showed.
 *
 * Cache-first with a network fallback: fonts are immutable and versioned by
 * URL, so a stale hit is not a risk worth a round trip.
 */
const FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com']

function isFontRequest(url) {
  return FONT_ORIGINS.includes(url.origin)
}

async function cacheFirstFont(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    // Font responses are frequently OPAQUE (the stylesheet <link> carries no
    // crossorigin attribute), so `response.ok` is false and status is 0.
    // `isCacheable` correctly rejects those everywhere else — an opaque body
    // cannot be validated — but for fonts an opaque hit is still a working
    // font, and refusing it is what left the icons broken offline.
    if (response && (response.ok || response.type === 'opaque')) {
      try {
        await cache.put(request, response.clone())
      } catch {
        /* quota or an unexpected Vary — serve the response anyway */
      }
    }
    return response
  } catch {
    // Offline with nothing cached. Returning an error here is honest: the
    // browser falls back to the next font in the stack.
    return Response.error()
  }
}

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
    await safePut(cache, '/index.html', fresh.clone())
    return fresh
  } catch {
    return (await cache.match(request)) || (await cache.match('/index.html')) || (await cache.match('/')) || Response.error()
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then(async (response) => {
      await safePut(cache, request, response.clone())
      return response
    })
    .catch(() => null)
  return cached || (await network) || Response.error()
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // The single cross-origin exception: the icon font the whole UI depends on.
  // Checked BEFORE the same-origin gate below, which would otherwise return.
  if (isFontRequest(url)) {
    event.respondWith(cacheFirstFont(request))
    return
  }

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
