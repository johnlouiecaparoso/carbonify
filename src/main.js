import { createApp } from 'vue'
import { createPinia } from 'pinia'

// Design tokens first, so every component style resolves against them.
import '@/styles/tokens.css'
import '@/styles/responsive.css'
import '@/styles/responsive-table.css'
// Last, so the preference overrides beat component defaults.
import '@/styles/preferences.css'

import App from './App.vue'
import router from './router'
import { analytics } from '@/utils/analytics'
import { initializeMobile } from '@/utils/mobile'
import { optimizeImageLoading } from '@/utils/imageOptimization'
import { setupServiceWorkerCache } from '@/utils/cache'
import { initSupabase } from '@/services/supabaseClient'
import { initSentry } from '@/utils/sentry'
import { modalA11y } from '@/directives/modalA11y'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Escape-to-close, focus trap and role="dialog" for the hand-rolled
// `.modal-overlay` dialogs (DEFERRED_BACKLOG #10). See the directive's header
// for why these are not routed through AccessibleModal.vue.
app.directive('modal-a11y', modalA11y)

// Optional error tracking — dormant unless VITE_SENTRY_DSN is set (the SDK is
// only loaded when a DSN exists). Fire-and-forget so it never delays mount.
initSentry(app, router)

// Initialize Supabase client (errors handled internally)
initSupabase().catch(() => {
  // Error already logged in initSupabase, no need to log again
})

app.mount('#app')

// NOTE: a "gentle cache invalidation" block used to sit here. One second after
// every load it deleted every Cache Storage entry whose name contained
// "carbonify" — which is exactly what public/sw.js names its caches
// (carbonify-shell-* / carbonify-assets-*). The service worker precached the
// app shell and the app immediately wiped it, so offline support and
// stale-while-revalidate asset caching never worked once. sw.js already
// invalidates old caches on activate via CACHE_VERSION; that is the only cache
// invalidation this app needs.

// Initialize analytics
analytics.initialize()

// Initialize mobile optimizations
initializeMobile()

// Initialize performance optimizations
optimizeImageLoading()

// NOTE: this file used to monkey-patch window.fetch and console.error globally
// to hide a manifest.json 401 on password-protected Vercel PREVIEW deploys. It
// could not work: <link rel="manifest"> is fetched by the browser itself, not
// through window.fetch, so the patch never saw the request it was written for.
// Meanwhile it wrapped every fetch in the app and swallowed any console.error
// mentioning manifest.json — including real ones, and including the breadcrumbs
// Sentry collects. The <link rel="manifest" onerror> in index.html already
// handles the preview case quietly.

setupServiceWorkerCache()

// Handle browser extension context errors (harmless)
window.addEventListener('error', (event) => {
  if (event.message && event.message.includes('Extension context invalidated')) {
    // This is a browser extension error, not our app - ignore it
    console.debug('Browser extension context invalidated (harmless)')
    event.preventDefault()
  }
})

// Handle unhandled promise rejections (like DOMException from service workers)
window.addEventListener('unhandledrejection', (event) => {
  // Silently ignore DOMException errors from service worker registration
  if (event.reason?.name === 'DOMException' && 
      (event.reason?.message?.includes('not, or is no longer, usable') ||
       event.reason?.message?.includes('Service Worker'))) {
    // Service worker errors are optional and not critical
    event.preventDefault()
    console.debug('Service Worker registration error (optional, safely ignored)')
    return
  }
  
  // Log other unhandled rejections for debugging
  console.warn('Unhandled promise rejection:', event.reason)
})
