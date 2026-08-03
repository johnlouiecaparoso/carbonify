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
//
// v5: cacheFirstFont no longer stores unverifiable opaque responses. Any device
// already holding a poisoned Google Fonts entry from v4 — the icons-render-as-
// words state — drops it on activate and re-fetches once.
const CACHE_VERSION = 'v5'
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
 *
 * ⚠️ CSP: both origins must be in **connect-src** in vercel.json, not only in
 * style-src/font-src. Those two cover the BROWSER loading the stylesheet and
 * the font file directly. Everything below is the WORKER calling fetch(), and a
 * fetch from a worker is governed by connect-src — the same header, because the
 * `/(.*)` block that sets it is also served with sw.js itself. While they were
 * missing, this handler took control on the second page load, every font
 * request it proxied was blocked, the catch below returned Response.error(),
 * and Material Symbols never loaded — so the icons came back as their names.
 */
const FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com']

function isFontRequest(url) {
  return FONT_ORIGINS.includes(url.origin)
}

/**
 * Fetch a Google Fonts URL in a way we can VALIDATE.
 *
 * The stylesheet <link> in index.html carries no crossorigin attribute, so the
 * browser issues it no-cors and hands back an OPAQUE response: status 0, no
 * headers, indistinguishable from a 500, a captive-portal redirect or an empty
 * body. This used to be cached as-is, cache-first and forever — so a single
 * failed request during one bad moment on mobile data poisoned the cache with
 * a stylesheet that would never work again, and every subsequent load rendered
 * the icons as their ligature names until CACHE_VERSION changed. That is a
 * permanent break caused by a transient fault, which is the worst trade a
 * cache can make.
 *
 * Both Google Fonts origins send `Access-Control-Allow-Origin: *`, so asking
 * for the same URL with `mode: 'cors'` costs nothing and returns a response
 * with a real status. A CORS response also satisfies the no-cors request that
 * triggered it — it is strictly more capable than the opaque one.
 */
async function fetchValidatableFont(request) {
  try {
    const corsResponse = await fetch(request.url, { mode: 'cors', credentials: 'omit' })
    if (corsResponse && corsResponse.ok) return corsResponse
  } catch {
    /* CORS blocked or offline — fall through to the plain request */
  }
  return fetch(request)
}

async function cacheFirstFont(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const response = await fetchValidatableFont(request)
    // Only a response we could actually verify gets stored. An opaque one is
    // still SERVED (it may well be fine, and the browser can use it), it is
    // just never written to a cache we then trust indefinitely.
    if (response && response.ok && response.type !== 'opaque') {
      try {
        await cache.put(request, response.clone())
      } catch {
        /* quota or an unexpected Vary — serve the response anyway */
      }
    }
    return response
  } catch {
    // Offline with nothing cached. Returning an error here is honest: the
    // browser falls back to the next font in the stack, and utils/iconFont.js
    // keeps the ligature names hidden until a later attempt succeeds.
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
