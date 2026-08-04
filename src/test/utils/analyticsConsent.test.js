import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { analytics, analyticsConsentGiven } from '@/utils/analytics'

/**
 * `privacy.allowAnalytics` is a switch on the preferences page. Until
 * 2026-08-04 it was read by **nothing** — every one of the six privacy controls
 * appeared in exactly two places, the store's defaults and the form that wrote
 * them. Turning analytics off did nothing at all.
 *
 * That is the placebo-control class this repo keeps finding (the theme toggle
 * that styled nothing, six languages with no i18n installed, accessibility
 * switches saved and never applied). A *consent* control is the worst member of
 * it: the user's belief that they opted out is itself the harm.
 *
 * These tests force `isEnabled` on, which is the only way to reach production
 * behaviour from a test — `isEnabled` is `import.meta.env.PROD`.
 */

function setPreferences(privacy) {
  localStorage.setItem('preferences', JSON.stringify({ privacy }))
}

describe('analytics honours the allowAnalytics consent switch', () => {
  beforeEach(() => {
    localStorage.clear()
    analytics.isEnabled = true
    // main.js calls initialize() at startup, so `config` is always present in
    // the app. Set it directly rather than calling initialize(), which also
    // registers listeners and a flush interval that would outlive the test.
    analytics.config = { trackingId: 'G-TEST12345', apiEndpoint: '/api/analytics' }
    window.gtag = vi.fn()
  })

  afterEach(() => {
    analytics.isEnabled = false
    delete window.gtag
    localStorage.clear()
  })

  it('sends nothing once the user opts out', () => {
    setPreferences({ allowAnalytics: false })

    analytics.trackPageView('Marketplace', '/marketplace')
    analytics.trackEvent('thing_happened', { a: 1 })
    analytics.trackUserAction('click', 'buy-button')
    analytics.trackPurchase('txn-123', 4500, 'PHP', [{ id: 'listing-1' }])

    expect(window.gtag).not.toHaveBeenCalled()
  })

  it('still sends when the user allows it', () => {
    setPreferences({ allowAnalytics: true })

    analytics.trackPageView('Marketplace', '/marketplace')

    expect(window.gtag).toHaveBeenCalled()
  })

  it('does not leak the purchase transaction id or value when opted out', () => {
    // The sharpest case: trackPurchase forwards a transaction id, an amount and
    // the user id. If any single call site had been missed, this is the one
    // that would matter.
    setPreferences({ allowAnalytics: false })

    analytics.trackPurchase('txn-should-not-leave', 999999, 'PHP', [])

    const sent = JSON.stringify(window.gtag.mock.calls)
    expect(sent).not.toContain('txn-should-not-leave')
    expect(sent).not.toContain('999999')
  })

  it('defaults to the preferences store default when nothing is stored', () => {
    // No `preferences` key at all — a user who has never opened the page. The
    // default must match preferencesStore's own, or this file would silently
    // disagree with the switch the user is shown.
    expect(analyticsConsentGiven()).toBe(true)
  })

  it('survives a corrupt or partial preferences blob', () => {
    localStorage.setItem('preferences', '{not json')
    expect(analyticsConsentGiven()).toBe(true)

    localStorage.setItem('preferences', JSON.stringify({ privacy: {} }))
    expect(analyticsConsentGiven()).toBe(true)

    localStorage.setItem('preferences', JSON.stringify({}))
    expect(analyticsConsentGiven()).toBe(true)

    // A non-boolean is not a consent decision.
    setPreferences({ allowAnalytics: 'no' })
    expect(analyticsConsentGiven()).toBe(true)
  })

  it('takes effect immediately, without a page reload', () => {
    setPreferences({ allowAnalytics: true })
    analytics.trackPageView('One', '/one')
    expect(window.gtag).toHaveBeenCalled()

    // The user opens preferences and switches it off mid-session. A cached
    // consent value would keep sending until the next load.
    window.gtag.mockClear()
    setPreferences({ allowAnalytics: false })
    analytics.trackPageView('Two', '/two')

    expect(window.gtag).not.toHaveBeenCalled()
  })

  it('does not inject the Google Analytics script without consent', () => {
    // gtag('config', …) sends a page_view on its own, so loading GA at all is
    // already tracking — gating only the later calls would leak the first one.
    setPreferences({ allowAnalytics: false })
    const spy = vi.spyOn(analytics, 'setupGoogleAnalytics').mockImplementation(() => {})
    // Stubbed so initialize() does not leave listeners and a 30s interval
    // running past the end of the test.
    const noop = () => {}
    const others = ['setupPerformanceTracking', 'setupErrorTracking', 'startFlushInterval'].map(
      (m) => vi.spyOn(analytics, m).mockImplementation(noop),
    )

    analytics.initialize({ trackingId: 'G-REAL12345' })
    expect(spy).not.toHaveBeenCalled()

    // ...and it IS called once consent is given, so the assertion above is not
    // passing for some unrelated reason.
    setPreferences({ allowAnalytics: true })
    analytics.initialize({ trackingId: 'G-REAL12345' })
    expect(spy).toHaveBeenCalled()
    ;[spy, ...others].forEach((s) => s.mockRestore())
  })
})
