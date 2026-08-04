/**
 * Analytics tracking utilities
 */

/**
 * Ceiling on each in-memory buffer.
 *
 * These arrays are append-only in practice: `flushEvents()` returns early
 * whenever `apiEndpoint` is relative, and it is — `/api/analytics` does not
 * exist (Vercel's `/(.*)` rewrite would answer a POST to it with index.html).
 * So nothing drains them, and an admin who leaves a polling dashboard open all
 * day grows them without limit.
 *
 * A ring rather than a hard stop: the newest entries are the ones worth having
 * if a flush target is ever added, and dropping the oldest is silent and cheap.
 */
const MAX_BUFFERED = 200

/** Append, discarding the oldest entries once the buffer is full. */
function pushBounded(buffer, entry) {
  buffer.push(entry)
  if (buffer.length > MAX_BUFFERED) buffer.splice(0, buffer.length - MAX_BUFFERED)
}

/**
 * The default when the user has never opened the preferences page. It matches
 * `preferencesStore`'s own default so this file cannot silently disagree with
 * the switch the user is shown.
 *
 * ⚠️ Whether analytics consent should default to ON at all is an opt-in/opt-out
 * question under the Philippine DPA, not an implementation choice — recorded in
 * DEFERRED_BACKLOG rather than decided here. This change only makes the
 * existing switch *work*; it does not change what it starts as.
 */
const DEFAULT_ANALYTICS_CONSENT = true

/**
 * Has the user allowed analytics?
 *
 * `preferencesStore.privacy.allowAnalytics` is rendered as a switch on the
 * preferences page and persisted into the `preferences` blob — and, until
 * 2026-08-04, **was read by absolutely nothing.** Every one of the six privacy
 * controls appeared in exactly two places: the store's defaults, and the form
 * that wrote them. Turning analytics off did nothing whatsoever.
 *
 * That is the same placebo-control class this file's own history is full of
 * (the theme toggle that styled nothing, the six languages with no i18n, the
 * accessibility switches that were saved and never applied) — but a consent
 * control is the worst member of it, because the user's belief that they opted
 * out is itself the harm.
 *
 * Read straight from localStorage rather than through the pinia store: this
 * module is instantiated at import time, long before any store is active, and
 * a consent check that throws is a consent check that gets removed.
 */
export function analyticsConsentGiven() {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_ANALYTICS_CONSENT
    const raw = localStorage.getItem('preferences')
    if (!raw) return DEFAULT_ANALYTICS_CONSENT
    const value = JSON.parse(raw)?.privacy?.allowAnalytics
    return typeof value === 'boolean' ? value : DEFAULT_ANALYTICS_CONSENT
  } catch {
    return DEFAULT_ANALYTICS_CONSENT
  }
}

class AnalyticsTracker {
  constructor() {
    this.isEnabled = import.meta.env.PROD
    this.userId = null
    this.sessionId = this.generateSessionId()
    this.events = []
    this.pageViews = []
    this.userActions = []
    this.performanceMetrics = []
  }

  /**
   * The single gate on anything leaving the browser.
   *
   * Six call sites each wrote `this.isEnabled && window.gtag` independently.
   * Adding consent as a seventh copy of the same condition is exactly how this
   * repo produces its signature defect — a guard applied to one branch and not
   * its neighbour — so the condition lives in one place and the call sites ask
   * it. Re-evaluated per call, not cached, so revoking consent takes effect
   * immediately rather than at the next page load.
   */
  canSend() {
    return Boolean(this.isEnabled && analyticsConsentGiven() && globalThis.window?.gtag)
  }

  /**
   * Initialize analytics
   */
  initialize(config = {}) {
    this.config = {
      // No placeholder default. This used to fall back to the literal string
      // 'GA-XXXXXXXXX', which is truthy — so setupGoogleAnalytics() below saw a
      // "configured" tracker and, on every production page load, injected a
      // gtag script tag for a measurement ID that does not exist.
      trackingId: config.trackingId || import.meta.env.VITE_GA_TRACKING_ID || '',
      apiEndpoint: config.apiEndpoint || '/api/analytics',
      batchSize: config.batchSize || 10,
      flushInterval: config.flushInterval || 30000, // 30 seconds
      ...config,
    }

    if (this.isEnabled) {
      // Consent is checked BEFORE the script is injected, not only at the send
      // sites. `setupGoogleAnalytics()` ends in `gtag('config', …)`, which
      // sends a page_view by itself — so loading GA at all is already the
      // tracking, and gating only the later calls would leak the first one.
      // It cannot use `canSend()`: that requires `window.gtag`, which this is
      // what creates.
      if (analyticsConsentGiven()) this.setupGoogleAnalytics()
      this.setupPerformanceTracking()
      this.setupErrorTracking()
      this.startFlushInterval()
    }
  }

  /**
   * Setup Google Analytics
   */
  setupGoogleAnalytics() {
    // A measurement ID that is absent or still a placeholder means analytics is
    // not set up; loading gtag for it only produces a blocked request and a CSP
    // violation. Google's own IDs are G-XXXX (GA4) or UA-XXXX (legacy).
    const id = this.config.trackingId
    const configured = id && !/^(GA-X+|G-X+|UA-X+)$/i.test(id)

    if (configured && typeof window !== 'undefined') {
      // Load Google Analytics script
      const script = document.createElement('script')
      script.async = true
      script.src = `https://www.googletagmanager.com/gtag/js?id=${this.config.trackingId}`
      document.head.appendChild(script)

      // Initialize gtag
      window.dataLayer = window.dataLayer || []
      function gtag() {
        window.dataLayer.push(arguments)
      }
      window.gtag = gtag
      gtag('js', new Date())
      gtag('config', this.config.trackingId, {
        page_title: document.title,
        page_location: window.location.href,
      })
    }
  }

  /**
   * Track page view
   */
  trackPageView(pageName, pagePath = null) {
    const pageData = {
      page_name: pageName,
      page_path: pagePath || window.location.pathname,
      page_url: window.location.href,
      page_title: document.title,
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      user_id: this.userId,
    }

    pushBounded(this.pageViews, pageData)

    if (this.canSend()) {
      gtag('config', this.config.trackingId, {
        page_title: pageData.page_title,
        page_location: pageData.page_url,
      })
    }

    this.trackEvent('page_view', pageData)
  }

  /**
   * Track custom event
   */
  trackEvent(eventName, parameters = {}) {
    const eventData = {
      event_name: eventName,
      parameters: {
        ...parameters,
        timestamp: new Date().toISOString(),
        session_id: this.sessionId,
        user_id: this.userId,
        page_url: window.location.href,
      },
    }

    pushBounded(this.events, eventData)

    if (this.canSend()) {
      gtag('event', eventName, parameters)
    }

    // Send to custom analytics endpoint
    this.sendToCustomEndpoint('event', eventData)
  }

  /**
   * Track user action
   */
  trackUserAction(action, element = null, value = null) {
    const actionData = {
      action_type: action,
      element: element
        ? {
            tag: element.tagName,
            id: element.id,
            class: element.className,
            text: element.textContent?.substring(0, 100),
          }
        : null,
      value: value,
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      user_id: this.userId,
      page_url: window.location.href,
    }

    pushBounded(this.userActions, actionData)
    this.trackEvent('user_action', actionData)
  }

  /**
   * Track performance metrics
   */
  trackPerformance(metricName, value, unit = 'ms') {
    const metricData = {
      metric_name: metricName,
      value: value,
      unit: unit,
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      user_id: this.userId,
    }

    pushBounded(this.performanceMetrics, metricData)

    if (this.canSend()) {
      gtag('event', 'performance_metric', {
        metric_name: metricName,
        metric_value: value,
        metric_unit: unit,
      })
    }
  }

  /**
   * Track e-commerce events
   */
  trackPurchase(transactionId, value, currency = 'USD', items = []) {
    const purchaseData = {
      transaction_id: transactionId,
      value: value,
      currency: currency,
      items: items,
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      user_id: this.userId,
    }

    this.trackEvent('purchase', purchaseData)

    if (this.canSend()) {
      gtag('event', 'purchase', {
        transaction_id: transactionId,
        value: value,
        currency: currency,
        items: items,
      })
    }
  }

  /**
   * Track search events
   */
  trackSearch(searchTerm, resultsCount = null, filters = {}) {
    this.trackEvent('search', {
      search_term: searchTerm,
      results_count: resultsCount,
      filters: filters,
    })
  }

  /**
   * Track error events
   */
  trackError(error, context = {}) {
    const errorData = {
      error_message: error.message,
      error_stack: error.stack,
      error_type: error.name,
      context: context,
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      user_id: this.userId,
      page_url: window.location.href,
    }

    this.trackEvent('error', errorData)
  }

  /**
   * Set user ID
   */
  setUserId(userId) {
    this.userId = userId

    if (this.canSend()) {
      gtag('config', this.config.trackingId, {
        user_id: userId,
      })
    }
  }

  /**
   * Set user properties
   */
  setUserProperties(properties) {
    if (this.canSend()) {
      gtag('config', this.config.trackingId, {
        custom_map: properties,
      })
    }
  }

  /**
   * Setup performance tracking
   */
  setupPerformanceTracking() {
    if (typeof window === 'undefined') return

    // Track page load performance
    window.addEventListener('load', () => {
      const navigation = performance.getEntriesByType('navigation')[0]

      if (navigation) {
        this.trackPerformance('page_load_time', navigation.loadEventEnd - navigation.fetchStart)
        this.trackPerformance(
          'dom_content_loaded',
          navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        )
        this.trackPerformance('first_paint', navigation.responseEnd - navigation.fetchStart)
      }

      // Track Core Web Vitals
      this.trackCoreWebVitals()
    })

    // NOTE: there is deliberately no API-performance hook here. See the block
    // where trackApiPerformance used to be, below.
  }

  /**
   * Track Core Web Vitals
   */
  trackCoreWebVitals() {
    // First Contentful Paint
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            this.trackPerformance('first_contentful_paint', entry.startTime)
          }
        }
      })
      observer.observe({ entryTypes: ['paint'] })
    }

    // Largest Contentful Paint
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const lastEntry = entries[entries.length - 1]
        this.trackPerformance('largest_contentful_paint', lastEntry.startTime)
      })
      observer.observe({ entryTypes: ['largest-contentful-paint'] })
    }

    // First Input Delay
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.trackPerformance('first_input_delay', entry.processingStart - entry.startTime)
        }
      })
      observer.observe({ entryTypes: ['first-input'] })
    }
  }

  /*
   * REMOVED 2026-08-04: `trackApiPerformance()` replaced `window.fetch` with a
   * wrapper, in PRODUCTION ONLY (`isEnabled = import.meta.env.PROD`), and it
   * shipped — `window.fetch=function` and `api_error_` were both present in the
   * built bundle.
   *
   * It recorded a metric per request named:
   *
   *     `api_${url}`        // url = the FULL request URL, query string included
   *
   * Two problems, and the first is the serious one.
   *
   * 1. It put request URLs somewhere they can leave the browser. A PostgREST
   *    URL carries its filter in the query string — `?id=eq.<uuid>`,
   *    `?email=eq.<address>` — and signed storage URLs carry a token. Every one
   *    became a `metric_name`, and `trackPerformance` forwards metric names to
   *    `gtag('event', 'performance_metric', …)` whenever `window.gtag` exists.
   *    Nobody has set `VITE_GA_TRACKING_ID` yet, so nothing has been sent; the
   *    moment anyone does, before a pilot say, user identifiers and signed
   *    tokens start flowing to Google Analytics. That is the opposite of the
   *    posture taken everywhere else here — Sentry runs `sendDefaultPii: false`
   *    and the build strips `console.log` precisely to keep ids out of logs.
   *
   * 2. It leaked memory with certainty rather than possibility. Each call
   *    pushes an object onto `performanceMetrics`, and `flushEvents()` returns
   *    early for a relative `apiEndpoint` (there is no `/api/analytics` — the
   *    Vercel rewrite would answer it with index.html), so nothing ever drains
   *    the array. One entry per fetch, for the life of the tab, on a dashboard
   *    that polls.
   *
   * Deleted rather than sanitised. The data had no sink: no backend receives
   * it, and per-URL timings are useless in GA anyway at that cardinality. If
   * API timing is ever wanted, the honest place is Sentry's tracing — already
   * configured, already sampling, already PII-aware — not a global override of
   * `fetch` that every Supabase call, the Sentry transport itself, and the
   * service worker registration all pass through.
   *
   * The array cap in the constructor stays regardless: see MAX_BUFFERED.
   */

  /**
   * Setup error tracking
   */
  setupErrorTracking() {
    if (typeof window === 'undefined') return

    // Track JavaScript errors
    window.addEventListener('error', (event) => {
      this.trackError(event.error, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      })
    })

    // Track unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.trackError(new Error(event.reason), {
        type: 'unhandled_promise_rejection',
      })
    })
  }

  /**
   * Send data to custom analytics endpoint
   * Skips when endpoint is relative (e.g. /api/analytics) and no backend exists (e.g. Vercel static deploy)
   */
  async sendToCustomEndpoint(type, data) {
    // `this.config` is only assigned in initialize(). main.js calls that at
    // startup so it is always set in the app — but any track* call made before
    // it (an import-time call, or a test) threw a TypeError here rather than
    // no-opping. Defensive, not a live bug.
    if (!this.config?.apiEndpoint) return
    if (this.config.apiEndpoint.startsWith('/') && typeof window !== 'undefined') return

    try {
      await fetch(this.config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: type,
          data: data,
          timestamp: new Date().toISOString(),
        }),
      })
    } catch (error) {
      console.error('Analytics tracking error:', error)
    }
  }

  /**
   * Flush events to server
   */
  async flushEvents() {
    if (this.events.length === 0) return
    if (this.config.apiEndpoint.startsWith('/') && typeof window !== 'undefined') return

    const eventsToSend = this.events.splice(0, this.config.batchSize)

    try {
      await fetch(this.config.apiEndpoint + '/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          events: eventsToSend,
          session_id: this.sessionId,
          user_id: this.userId,
        }),
      })
    } catch (error) {
      console.error('Analytics flush error:', error)
      // Re-add events to queue if flush failed
      this.events.unshift(...eventsToSend)
    }
  }

  /**
   * Start flush interval
   */
  startFlushInterval() {
    setInterval(() => {
      this.flushEvents()
    }, this.config.flushInterval)
  }

  /**
   * Generate session ID
   */
  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  }

  /**
   * Get analytics data
   */
  getAnalyticsData() {
    return {
      events: this.events,
      pageViews: this.pageViews,
      userActions: this.userActions,
      performanceMetrics: this.performanceMetrics,
      sessionId: this.sessionId,
      userId: this.userId,
    }
  }

  /**
   * Clear analytics data
   */
  clearData() {
    this.events = []
    this.pageViews = []
    this.userActions = []
    this.performanceMetrics = []
  }
}

// Create singleton instance
export const analytics = new AnalyticsTracker()

// Auto-initialize in production
if (import.meta.env.PROD && typeof window !== 'undefined') {
  analytics.initialize()
}

// Nine convenience re-exports (trackPageView, trackEvent, trackUserAction,
// trackPerformance, trackPurchase, trackSearch, trackError, setUserId,
// setUserProperties) were REMOVED 2026-08-01 as part of DEFERRED_BACKLOG #30.
//
// Each was a one-line wrapper delegating to the singleton below, and NOT ONE of
// them was imported anywhere: `main.js` imports `analytics` itself and calls the
// methods directly. Their existence made the module look like the app was
// instrumented in nine places when it is instrumented in one.
//
// The methods are still on `analytics` — nothing lost a capability. Call
// `analytics.trackEvent(...)` if instrumentation is ever wanted at a call site.
