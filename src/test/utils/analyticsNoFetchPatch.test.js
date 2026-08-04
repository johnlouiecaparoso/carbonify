import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { analytics } from '@/utils/analytics'

/**
 * Two properties of the analytics module that are invisible in development and
 * only existed in the PRODUCTION bundle, which is why neither was noticed.
 *
 * `AnalyticsTracker.isEnabled` is `import.meta.env.PROD`, so every listener,
 * interval and — until 2026-08-04 — the `window.fetch` replacement was skipped
 * under `npm run dev` and under vitest. The wrapper was verified present in the
 * built output (`window.fetch=function` and `api_error_` both appear in
 * `dist/js/analytics-*.js`); it was not a theoretical path.
 *
 * These tests therefore force `isEnabled` on, which is the only way to reach
 * the production behaviour from here.
 */

const SENTINEL = function sentinelFetch() {
  return Promise.resolve()
}

describe('analytics does not replace window.fetch', () => {
  let realFetch

  beforeEach(() => {
    realFetch = window.fetch
    // Asserting against a value we installed ourselves, rather than against
    // whatever happy-dom provides: if `window.fetch` were undefined here, an
    // identity check would pass vacuously and prove nothing.
    window.fetch = SENTINEL
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    window.fetch = realFetch
    analytics.isEnabled = false
  })

  it('leaves fetch untouched even with the tracker fully enabled', () => {
    analytics.isEnabled = true

    analytics.initialize({ trackingId: '', apiEndpoint: '/api/analytics' })

    // The wrapper recorded a metric named `api_${url}` — the FULL request URL,
    // query string included. PostgREST puts its filter there (`?id=eq.<uuid>`,
    // `?email=eq.<address>`) and signed storage URLs put a token there, and
    // `trackPerformance` forwards metric names to gtag whenever window.gtag
    // exists. Setting VITE_GA_TRACKING_ID would have started shipping user
    // identifiers to Google Analytics with no other change.
    expect(window.fetch).toBe(SENTINEL)
  })

  it('still leaves fetch untouched when a measurement ID is configured', () => {
    analytics.isEnabled = true

    // A configured ID makes setupGoogleAnalytics inject a <script> for gtag.
    // Intercepted rather than allowed: happy-dom would really go and fetch
    // googletagmanager.com, which makes the suite depend on the network.
    const appended = []
    const appendChild = vi
      .spyOn(document.head, 'appendChild')
      .mockImplementation((node) => appended.push(node))

    try {
      analytics.initialize({ trackingId: 'G-REAL12345', apiEndpoint: '/api/analytics' })

      // Confirms the branch under test actually ran — otherwise this test
      // would assert the fetch identity along a path where nothing happens.
      expect(appended).toHaveLength(1)
      expect(window.fetch).toBe(SENTINEL)
    } finally {
      appendChild.mockRestore()
    }
  })
})

describe('the in-memory buffers are bounded', () => {
  beforeEach(() => {
    analytics.isEnabled = false
    analytics.initialize({ trackingId: '', apiEndpoint: '/api/analytics' })
    analytics.clearData()
  })

  it('drops the oldest metrics instead of growing forever', () => {
    // Nothing drains these: flushEvents() returns early for a relative
    // apiEndpoint, and /api/analytics does not exist — Vercel's catch-all
    // rewrite would answer a POST to it with index.html.
    for (let i = 0; i < 500; i += 1) analytics.trackPerformance('page_load_time', i)

    expect(analytics.performanceMetrics.length).toBeLessThanOrEqual(200)
  })

  it('keeps the NEWEST entries, which are the ones worth having', () => {
    for (let i = 0; i < 500; i += 1) analytics.trackPerformance('page_load_time', i)

    const values = analytics.performanceMetrics.map((m) => m.value)
    expect(values.at(-1)).toBe(499)
    expect(values).not.toContain(0)
  })

  it('bounds the event buffer too', () => {
    for (let i = 0; i < 500; i += 1) analytics.trackEvent('page_view', { i })

    expect(analytics.events.length).toBeLessThanOrEqual(200)
  })

  it('bounds page views and user actions', () => {
    for (let i = 0; i < 300; i += 1) analytics.trackPageView(`page-${i}`)
    for (let i = 0; i < 300; i += 1) analytics.trackUserAction('click')

    expect(analytics.pageViews.length).toBeLessThanOrEqual(200)
    expect(analytics.userActions.length).toBeLessThanOrEqual(200)
  })
})
