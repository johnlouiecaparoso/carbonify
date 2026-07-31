/**
 * Service worker registration.
 *
 * This file was 220 lines of caching utilities — a `MemoryCache` class and
 * three instances of it (`apiCache`, `imageCache`, `userCache`), plus
 * `cachedApiCall`, `cachedImageLoad`, and get/set pairs for user preferences,
 * marketplace listings and analytics data. Nothing outside this file imported
 * any of it. The only reason the three cache instances looked used was that the
 * dead helpers referenced each other; removing the helpers left the instances
 * with no callers at all.
 *
 * Real caching on this app is done by public/sw.js — which is what the one
 * surviving function registers, and which only started working on 2026-07-26,
 * when a stray block in main.js stopped deleting its caches a second after
 * every page load.
 *
 * Removed 2026-07-26 (backlog #30). Recoverable from git if an in-memory cache
 * is ever genuinely wanted.
 */

export function setupServiceWorkerCache() {
  if (!('serviceWorker' in navigator)) {
    return
  }

  const { protocol, hostname } = window.location
  const isSecureContext =
    window.isSecureContext ||
    protocol === 'https:' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1'

  if (!isSecureContext) {
    console.debug('Skipping service worker cache setup: insecure context detected')
    return
  }

  // Use setTimeout to avoid DOMException from using objects after page navigation
  setTimeout(() => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (registration && registration.active) {
          console.log('✅ Service Worker registered successfully')
        }
      })
      .catch(() => {
        /* optional: SW not available (e.g. Vercel serves HTML for /sw.js) */
      })
  }, 100)
}
