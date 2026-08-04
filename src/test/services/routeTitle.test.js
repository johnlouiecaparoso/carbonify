import { describe, it, expect } from 'vitest'
import { titleFromRouteName } from '@/router'

/**
 * Every route served the SAME document title until 2026-08-04 — measured across
 * the seven public routes, all of them `"Carbonify - Carbon Credit Marketplace"`,
 * the static one from `index.html`.
 *
 * **No automated accessibility checker can find this.** Each page individually
 * has a non-empty `<title>`, which is all axe can ask; that they are all
 * identical is only visible by loading several routes and comparing. It is a
 * WCAG 2.4.2 (Page Titled, Level A) failure all the same, and the cost lands
 * hardest on the people the criterion exists for: a screen-reader user hears the
 * title announced on every navigation, so the app said the same sentence whether
 * they had arrived at the marketplace, their wallet, or a failed checkout.
 *
 * Titles are DERIVED from `route.name` in a single `afterEach`, not stored on
 * each of ~80 route records — a per-route field is a field somebody forgets on
 * the next route, and that failure is silent.
 */
describe('titleFromRouteName', () => {
  it('capitalises a simple route name', () => {
    expect(titleFromRouteName('home')).toBe('Home')
    expect(titleFromRouteName('marketplace')).toBe('Marketplace')
  })

  it('turns kebab-case into words', () => {
    expect(titleFromRouteName('forgot-password')).toBe('Forgot Password')
    expect(titleFromRouteName('payment-callback')).toBe('Payment Callback')
  })

  it('handles underscores and slashes in a name', () => {
    expect(titleFromRouteName('admin_users')).toBe('Admin Users')
    expect(titleFromRouteName('admin/kyc')).toBe('Admin Kyc')
  })

  it('returns an empty string for a nameless route rather than "Undefined"', () => {
    // Unnamed routes exist (redirects, catch-alls). The caller falls back to the
    // bare app name; it must not render the string "Undefined · Carbonify".
    expect(titleFromRouteName(undefined)).toBe('')
    expect(titleFromRouteName(null)).toBe('')
    expect(titleFromRouteName('')).toBe('')
  })

  it('collapses repeated and trailing separators', () => {
    expect(titleFromRouteName('a--b-')).toBe('A B')
  })
})
